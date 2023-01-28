"""
Implementation of the 'Deploy a Qlik Sense application to a tenant' tutorial from https://qlik.dev/tutorials/deploy-a-qlik-sense-application-to-a-tenant

For a detailed overview of the supported arguments execute:

    python tenant_deploy_content.py --help
"""
import argparse
import json
import logging
import os
import shutil
import time

from argparse_logging import add_log_level_argument
from qlik_sdk import AssignmentCreate
from requests import HTTPError

import constants
import qlik_sdk_helper
from jwt_auth import JwtAuth, JwtIdpConfig

logger = logging.getLogger(__name__)


def verify_bot_access_to_source_app(sdk_client, app_id):
    user_id = sdk_client.users.get_me().id

    app = sdk_client.apps.get(app_id)
    logger.info(f"Retrieved the app with ID '{app_id}' from tenant '{sdk_client.config.host}'.")

    # If the app is in a shared space the bot user (who is a tenant admin) needs to assign themselves to the
    # space before they can access the app
    if hasattr(app.attributes, 'spaceId'):
        space = sdk_client.spaces.get(app.attributes.spaceId)
        logger.info(f"Retrieved the space with ID '{space.id}' from tenant '{sdk_client.config.host}'.")

        if space.type != "shared":
            logger.error(f"The source app with ID '{app_id}' is in a managed space, it must be in a shared or personal space in tenant '{sdk_client.config.host}'.")
            exit(1)

        roles = ["producer"]
        try:
            space.create_assignment(AssignmentCreate(type="user", assigneeId=user_id, roles=roles))
        except HTTPError as http_error:
            # Ignore the error if the bot user has already been assigned to the space
            if http_error.response.status_code == 409:
                logger.info(
                    f"The user with ID '{user_id}' is already assigned to the space with ID '{space.id}' in tenant '{sdk_client.config.host}'.")
            else:
                raise http_error
        else:
            logger.info(
                f"The user with ID '{user_id}' has been assigned to the space with ID '{space.id}' with the roles '{roles}' in tenant '{sdk_client.config.host}'.")

    logger.info(f"Verified that the user with ID '{user_id}' has access to the app with '{app_id}' in tenant '{sdk_client.config.host}'.")


def export_app(sdk_client, app_id):
    app = sdk_client.apps.get(app_id)
    logger.info(f"Retrieved the app with ID '{app_id}' from tenant '{sdk_client.config.host}'.")

    app_location_url = app.export()

    # Download the app to a local file so it can be imported
    exported_app_file_name = f"{app.attributes.name}.qvf"
    with sdk_client.rest(path=app_location_url, method="get", stream=True) as http_response:
        exported_app_file = open(exported_app_file_name, "w+b")
        shutil.copyfileobj(http_response.raw, exported_app_file)
        exported_app_file.seek(0)

        logger.info(
            f"Exported the app '{app.attributes.name}' with ID '{app_id}' from '{sdk_client.config.host}' to '{exported_app_file.name}'.")

        return exported_app_file


def import_app(sdk_client, app_file, space_id):
    dev_space = sdk_client.spaces.get(space_id)
    logger.info(f"Retrieved the space with ID '{dev_space.id}' from tenant '{sdk_client.config.host}'.")

    imported_app = sdk_client.apps.import_app(
        data=app_file,
        spaceId=space_id,
        mode="autoreplace"
    )

    logger.info(
        f"Imported the app '{os.path.realpath(app_file.name)}' to app '{imported_app.attributes.name}' with ID '{imported_app.attributes.id} in space '{dev_space.name}' with ID '{dev_space.id}' in '{sdk_client.config.host}'")
    return imported_app


def publish_app(sdk_client, imported_app, space_id):
    space = sdk_client.spaces.get(space_id)
    logger.info(f"Retrieved the space with ID '{space_id}' from tenant '{sdk_client.config.host}'.")

    if space.type != "managed":
        logger.error(f"The space ID '{space_id}' given for tenant '{sdk_client.config.host}' must be a managed space.")
        exit(1)

    # Determine if the app has already been previously published
    published_app_id = None
    app_items = sdk_client.items.get_items(resourceType="app", spaceId=space_id).pagination
    for app_item in app_items:
        if app_item.resourceAttributes['originAppId'] == imported_app.attributes.id:
            published_app_id = app_item.resourceAttributes['id']
            break

    logger.info(
        f"Queried the items in space '{space.name}' with ID '{imported_app.attributes.id}' to determine if the app with ID '{imported_app.attributes.id} has been previously published in tenant '{sdk_client.config.host}'")

    if published_app_id:
        # This will do a republish (replaces the previously published app)
        published_app = imported_app.set_publish({"spaceId": space_id, "targetId": published_app_id})

        logger.info(
            f"Republished the app with ID '{imported_app.attributes.id}' to the app with ID '{published_app.attributes.id}' in tenant '{sdk_client.config.host}'.")
    else:
        published_app = imported_app.publish({"spaceId": space_id})
        logger.info(
            f"Published the app with ID '{imported_app.attributes.id}' to the app with ID '{published_app.attributes.id}' in tenant '{sdk_client.config.host}'.")

    logger.info(
            f"The app '{imported_app.attributes.name}' with ID '{imported_app.attributes.id}' has been published to space '{space.name}' with app ID '{published_app.attributes.id}' in tenant '{sdk_client.config.host}'.")
    return published_app


def verify_user_access_to_published_app(sdk_client, managed_space_id, published_app, jwt_idp_config):
    jwt_auth = JwtAuth(sdk_client.config.host, jwt_idp_config, subject=f"temp_user", name=f"temp_user",
                       email=f"temp_user@jwt.io", groups=[constants.GROUP_ANALYTICS_CONSUMER])

    user = json.loads(jwt_auth.rest(path="/api/v1/users/me", method="GET").text)

    logger.info(
        f"Created a JWT authentication session for a user in group '{constants.GROUP_ANALYTICS_CONSUMER}' in tenant '{sdk_client.config.host}'.")

    # Retry in case of failure
    retry_count = 0
    while retry_count < 120:
        try:
            jwt_auth.rest(path=f"/api/v1/apps/{published_app.attributes.id}", method="GET")
        except HTTPError as http_error:
            if http_error.response.status_code == 403:
                time.sleep(1)
                retry_count += 1
            else:
                raise http_error
        else:
            logger.info(
                f"Verified user access for the group '{constants.GROUP_ANALYTICS_CONSUMER}' to the published app with ID '{published_app.attributes.id}' in tenant '{sdk_client.config.host}'.")
            if retry_count > 0:
                logger.warning(f"It took '{retry_count + 1}' attempts to verify access to the published app.")
            break

    # Delete the temporary user, it's not needed
    sdk_client.rest(path=f"/api/v1/users/{user['id']}", method="DELETE")

    logger.info(f"Deleted temporary user with ID '{user['id']}' from '{sdk_client.config.host}'.")


def run(source_tenant_sdk_client, source_app_id, target_tenant_sdk_client, target_shared_space_id,
        target_managed_space_id, jwt_idp_config):
    verify_bot_access_to_source_app(source_tenant_sdk_client, source_app_id)

    with export_app(source_tenant_sdk_client, source_app_id) as exported_app_file:
        try:
            imported_app = import_app(target_tenant_sdk_client, exported_app_file, target_shared_space_id)
        finally:
            exported_app_file.close()
            os.remove(exported_app_file.name)

    published_app = publish_app(target_tenant_sdk_client, imported_app, target_managed_space_id)

    if jwt_idp_config:
        verify_user_access_to_published_app(target_tenant_sdk_client, target_managed_space_id, published_app,
                                            jwt_idp_config)

    logging.info(
        f"Deployed and published an app from '{source_tenant_sdk_client.config.host}' to '{target_tenant_sdk_client.config.host}'.")

    return published_app.attributes.id


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    add_log_level_argument(parser)
    parser.add_argument("--client-id", required=True, help="The OAuth client ID.")
    parser.add_argument("--client-secret", required=True, help="The OAuth client secret.")

    source_tenant_group = parser.add_argument_group("Source Tenant Information")
    source_tenant_group.add_argument("--source-tenant-hostname", required=True,
                                     help="The hostname of the source tenant, for example: tenant.region.qlikcloud.com")
    source_tenant_group.add_argument("--source-app-id", required=True,
                                     help="The ID of the app in the source tenant to deploy to the target tenant.")

    target_tenant_group = parser.add_argument_group("Target Tenant Information")
    target_tenant_group.add_argument("--target-tenant-hostname", required=True,
                                     help="The hostname of the target tenant to deploy content to, for example: tenant.region.qlikcloud.com")
    target_tenant_group.add_argument("--target-shared-space-id", required=True, help="increase output verbosity")
    target_tenant_group.add_argument("--target-managed-space-id", required=True, help="increase output verbosity")

    jwt_group = parser.add_argument_group("Target Tenant JWT IdP Configuration")
    jwt_group.add_argument("--jwt-issuer", required=False, help="The 'issuer' field to use in the JWT.")
    jwt_group.add_argument("--jwt-key-id", required=False, help="The 'kid' field to use in the JWT.")
    jwt_group.add_argument("--jwt-private-key", required=False, help="The path to the local private key file.")
    jwt_group.add_argument("--jwt-public-key", required=False, help="The path to the local public key file.")

    args = parser.parse_args()
    logging.basicConfig(level=args.log_level)

    jwt_idp_config = None
    if args.jwt_issuer or args.jwt_key_id or args.jwt_private_key or args.jwt_public_key:
        jwt_idp_config = JwtIdpConfig(args.jwt_issuer, args.jwt_key_id, args.jwt_private_key, args.jwt_public_key)
        if not jwt_idp_config.validate():
            parser.print_help()
            exit(1)

    source_tenant_sdk_client = qlik_sdk_helper.create_sdk_client(args.client_id, args.client_secret,
                                                                 args.source_tenant_hostname)
    target_tenant_sdk_client = qlik_sdk_helper.create_sdk_client(args.client_id, args.client_secret,
                                                                 args.target_tenant_hostname)

    run(source_tenant_sdk_client, args.source_app_id, target_tenant_sdk_client, args.target_shared_space_id,
        args.target_managed_space_id, jwt_idp_config)
