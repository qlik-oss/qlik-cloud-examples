import argparse
import http.server
import json
import logging
import random
import ssl
from urllib.parse import urlparse

from argparse_logging import add_log_level_argument
from jinja2 import Environment, FileSystemLoader, select_autoescape

import constants
import qlik_sdk_helper
from jwt_auth import JwtAuth, JwtIdpConfig

logger = logging.getLogger(__name__)


class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    jwt_auth = None
    index_html_page = None

    def end_headers(self):
        # Include additional response headers here. CORS for example:
        self.send_header('Access-Control-Allow-Origin', '*')
        http.server.SimpleHTTPRequestHandler.end_headers(self)

    def do_GET(self):
        if self.path == '/jwt':
            self.send_response(200)
            self.send_header("Content-type", "Content-Type: application/json")
            self.end_headers()
            self.wfile.write(bytes(json.dumps({
                "body": self.jwt_auth.generate_token()
            }), "utf-8"))
        else:
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(bytes(self.index_html_page, "utf-8"))


def get_random_sheet_id(sdk_client, app_id):
    # Open the app and pick a random sheet and return its ID
    app = sdk_client.apps.get(app_id)
    logger.info(f"Retrieved the app with ID '{app_id}' from tenant '{sdk_client.config.host}'.")

    with app.open():
        session_obj = app.create_session_object({
            "qInfo": {
                "qType": "SheetList",
                "qId": ""
            },
            "qAppObjectListDef": {
                "qData": {
                    "title": "/qMetaDef/title",
                    "labelExpression": "/labelExpression",
                    "showCondition": "/showCondition",
                    "description": "/qMetaDef/description",
                    "descriptionExpression": "/qMetaDef/descriptionExpression",
                    "thumbnail": "/qMetaDef/thumbnail",
                    "cells": "/cells",
                    "rank": "/rank",
                    "columns": "/columns",
                    "rows": "/rows"
                },
                "qType": "sheet"
            }
        })
        sheet_list_layout = session_obj.get_layout()
        sheet_id_list = [q.qInfo.qId for q in sheet_list_layout.qAppObjectList.qItems]
        random_sheet_id = sheet_id_list[random.randint(0, len(sheet_id_list) - 1)]

        logger.info(
            f"Opened a web socket to the app '{app.attributes.name}' with ID '{app.attributes.id}' on tenant '{sdk_client.config.host}' and selected the sheet with ID '{random_sheet_id}' to embed.")

        return random_sheet_id


def create_web_integration(sdk_client):
    # Check for an existing web integration with our origin
    for existing_web_integration in json.loads(sdk_client.rest(path="/api/v1/web-integrations").text)['data']:
        if constants.LOCAL_WEB_SERVER_ADDRESS in existing_web_integration['validOrigins']:
            logger.info(
                f"Using existing web integration '{existing_web_integration['name']}' with ID '{existing_web_integration['id']}' in tenant '{sdk_client.config.host}'.")

            return existing_web_integration['id']

    # No matching web integration exists, create a new one
    web_integration = json.loads(sdk_client.rest(
        path="/api/v1/web-integrations",
        method="POST",
        data={
            "name": "platform-ops-example-web-integration",
            "validOrigins": [constants.LOCAL_WEB_SERVER_ADDRESS]
        }
    ).text)

    logger.info(
        f"Created web integration '{web_integration['name']}' with ID '{web_integration['id']}' in tenant '{sdk_client.config.host}'.")

    return web_integration['id']


def create_content_security_policy(sdk_client):
    # Check for an existing csp with our origin and access rules
    for existing_csp in json.loads(sdk_client.rest(path="/api/v1/csp-origins").text)['data']:
        if f"https://{existing_csp['origin']}" == constants.LOCAL_WEB_SERVER_ADDRESS and existing_csp['frameAncestors']:
            logger.info(
                f"Using existing content security '{existing_csp['name']}' with ID '{existing_csp['id']}' in tenant '{sdk_client.config.host}'.")

            return

    # No matching csp exists, create a new one
    csp = json.loads(sdk_client.rest(
        path="/api/v1/csp-origins",
        method="POST",
        data={
            "name": "platform-ops-example-csp",
            "origin": constants.LOCAL_WEB_SERVER_ADDRESS,
            "imgSrc": False,
            "fontSrc": False,
            "childSrc": False,
            "frameSrc": True,
            "mediaSrc": False,
            "styleSrc": False,
            "objectSrc": False,
            "scriptSrc": False,
            "workerSrc": False,
            "connectSrc": False,
            "formAction": False,
            "connectSrcWSS": False,
            "frameAncestors": True
        }
    ).text)

    logger.info(
        f"Created content security policy {csp['name']} with ID '{csp['id']}' in tenant '{sdk_client.config.host}'.")


def run(jwt_auth, sdk_client, published_app_id, published_app_sheet_id=None):
    web_integration_id = create_web_integration(sdk_client)
    create_content_security_policy(sdk_client)

    if not published_app_sheet_id:
        published_app_sheet_id = get_random_sheet_id(sdk_client, published_app_id)

    jinja_env = Environment(
        loader=FileSystemLoader("."),
        autoescape=select_autoescape()
    )

    index_html_page = jinja_env.get_template("index.jinja").render(
        TENANT_HOSTNAME=jwt_auth.host.replace("https://", ""),
        JWT_URL=f"{constants.LOCAL_WEB_SERVER_ADDRESS}/jwt",
        WEB_INTEGRATION_ID=web_integration_id,
        APP_ID=published_app_id,
        SHEET_ID=published_app_sheet_id)

    web_server_address_parts = urlparse(constants.LOCAL_WEB_SERVER_ADDRESS)
    web_server_address = (str(web_server_address_parts.hostname), int(web_server_address_parts.port))

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.check_hostname = False
    ctx.load_cert_chain(certfile=jwt_auth.config.public_key_file_path, keyfile=jwt_auth.config.private_key_file_path)

    handler = CORSHTTPRequestHandler
    handler.jwt_auth = jwt_auth
    handler.index_html_page = index_html_page

    httpd = http.server.HTTPServer(web_server_address, handler)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    logger.info(
        f"Starting web server using embedded sheet with ID '{published_app_sheet_id}' from app with ID '{published_app_id}' from tenant '{jwt_auth.host}'.")

    print()
    print(f"To view the embedded content open this URL in your browser: {constants.LOCAL_WEB_SERVER_ADDRESS}")
    print()
    logger.warning(
        "If you're using Chrome you'll need to enable self signed certificates, see https://communicode.io/allow-https-localhost-chrome/. For other browsers, YMMV...")

    httpd.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    add_log_level_argument(parser)
    parser.add_argument("--client-id", required=True, help="The OAuth client ID.")
    parser.add_argument("--client-secret", required=True, help="The OAuth client secret.")

    target_tenant_group = parser.add_argument_group("Target Tenant Information")
    target_tenant_group.add_argument("--target-tenant-hostname", required=True,
                                     help="The hostname of the target tenant to embed, for example: tenant.region.qlikcloud.com")
    target_tenant_group.add_argument("--target-published-app-id", required=True,
                                     help="The ID of the published app from the target tenant to use when embedding.")
    target_tenant_group.add_argument("--target-published-app-sheet-id", required=False, default=None,
                                     help="The ID of the sheet in the published app to embed. If no sheet ID is provided a random one will be selected.")

    jwt_group = parser.add_argument_group("Target JWT IdP Configuration")
    jwt_group.add_argument("--jwt-issuer", required=True, help="The 'issuer' field to use in the JWT.")
    jwt_group.add_argument("--jwt-key-id", required=True, help="The 'kid' field to use in the JWT.")
    jwt_group.add_argument("--jwt-private-key", required=True, help="The path to the local private key file.")
    jwt_group.add_argument("--jwt-public-key", required=True, help="The path to the local public key file.")

    jwt_claims = parser.add_argument_group("JWT Claims")
    jwt_claims.add_argument("--jwt-claim-subject", required=False, default="jwt_test_user",
                            help="The 'subject' field to use in the JWT claim.")
    jwt_claims.add_argument("--jwt-claim-name", required=False, default="JWT Test User",
                            help="The 'name' field to use in the JWT claim.")
    jwt_claims.add_argument("--jwt-claim-email", required=False, default="jwt_test_user@jwt.io",
                            help="The 'email' field to use in the JWT claim.")
    jwt_claims.add_argument("--jwt-claim-email_verified", required=False, default=True, type=bool,
                            help="The 'email_verified' field to use in the JWT claim.")
    jwt_claims.add_argument("--jwt-claim-groups", required=False, default=[constants.GROUP_ANALYTICS_CONSUMER],
                            nargs='+',
                            help="The 'groups' field to use in the JWT claim (multiple groups can be specified).")
    jwt_claims.add_argument("--jwt-claim-expires_in", required=False, default=60, type=int,
                            help="The 'expires_in' field to use in the JWT.")

    args = parser.parse_args()
    logging.basicConfig(level=args.log_level)

    jwt_idp_config = JwtIdpConfig(args.jwt_issuer, args.jwt_key_id, args.jwt_private_key, args.jwt_public_key)
    if not jwt_idp_config.validate():
        parser.print_help()
        exit(1)

    jwt_auth = JwtAuth(f"https://{args.target_tenant_hostname}",
                       jwt_idp_config, args.jwt_claim_subject, args.jwt_claim_name, args.jwt_claim_email,
                       args.jwt_claim_email_verified,
                       args.jwt_claim_groups, args.jwt_claim_expires_in)

    target_tenant_sdk_client = qlik_sdk_helper.create_sdk_client(args.client_id, args.client_secret,
                                                                 args.target_tenant_hostname)

    run(jwt_auth, target_tenant_sdk_client, args.target_published_app_id, args.target_published_app_sheet_id)
