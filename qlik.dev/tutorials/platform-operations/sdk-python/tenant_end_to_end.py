"""
End to end implementation of the following tutorials:

* 'Create a tenant' tutorial from https://qlik.dev/tutorials/create-a-tenant
* 'Configure a tenant' tutorial from https://qlik.dev/tutorials/configure-a-tenant
* 'Deploy a Qlik Sense application to a tenant' tutorial from https://qlik.dev/tutorials/deploy-a-qlik-sense-application-to-a-tenant

For a detailed overview of the supported arguments execute:

    python tenant_end_to_end.py --help
"""
import argparse
import logging

from argparse_logging import add_log_level_argument

import qlik_sdk_helper
import tenant_configure
import tenant_create
import tenant_deploy_content
from jwt_auth import JwtIdpConfig


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    add_log_level_argument(parser)
    parser.add_argument("--client-id", required=True, help="The OAuth Client ID.")
    parser.add_argument("--client-secret", required=True, help="The OAuth client secret.")
    parser.add_argument("--tenant-registration-hostname", required=True,
                        help="The Qlik tenant registration hostname, for example: register.<REGION>.qlikcloud.com")

    jwt_group = parser.add_argument_group("Target Tenant JWT IdP Configuration")
    jwt_group.add_argument("--jwt-issuer", required=False, help="The 'issuer' field to use in the JWT.")
    jwt_group.add_argument("--jwt-key-id", required=False, help="The 'kid' field to use in the JWT.")
    jwt_group.add_argument("--jwt-private-key", required=False, help="The path to the local private key file.")
    jwt_group.add_argument("--jwt-public-key", required=False, help="The path to the local public key file.")

    source_tenant_group = parser.add_argument_group("Source Tenant Info")
    source_tenant_group.add_argument("--source-tenant-hostname", required=True,
                                     help="The hostname of the source tenant, for example: tenant.region.qlikcloud.com")
    source_tenant_group.add_argument("--source-tenant-admin-email", required=False,
                                     help="The email address of a tenant admin in the source tenant. If this is provided the tenant admin from the source tenant will be given access to the new tenant.")
    source_tenant_group.add_argument("--source-app-id", required=True,
                                     help="The ID of the app in the source tenant to deploy to the target tenant.")

    args = parser.parse_args()
    logging.basicConfig(level=args.log_level)

    jwt_idp_config = JwtIdpConfig(args.jwt_issuer, args.jwt_key_id, args.jwt_private_key, args.jwt_public_key)
    if not jwt_idp_config.validate():
        parser.print_help()
        exit(1)

    source_tenant_sdk_client = qlik_sdk_helper.create_sdk_client(args.client_id, args.client_secret,
                                                                 args.source_tenant_hostname)
    tenant_registration_sdk_client = qlik_sdk_helper.create_sdk_client(args.client_id, args.client_secret,
                                                                       args.tenant_registration_hostname)

    target_tenant_sdk_client = tenant_create.run(source_tenant_sdk_client, tenant_registration_sdk_client,
                                                 args.client_id, args.client_secret, args.source_tenant_admin_email)

    target_shared_space_id, target_managed_space_id = tenant_configure.run(target_tenant_sdk_client, jwt_idp_config)
    tenant_deploy_content.run(source_tenant_sdk_client, args.source_app_id, target_tenant_sdk_client,
                              target_shared_space_id,
                              target_managed_space_id, jwt_idp_config)
