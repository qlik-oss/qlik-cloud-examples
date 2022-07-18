"""
Implementation of the 'Create a tenant' tutorial from https://qlik.dev/tutorials/create-a-tenant

For a detailed overview of the supported arguments execute:

    python tenant_create.py --help

"""
import argparse
import json
import logging

from argparse_logging import add_log_level_argument
from qlik_sdk import UserPostSchema

import constants
import qlik_sdk_helper

logger = logging.getLogger(__name__)


def get_signed_entitlement_key(sdk_client):
    license_overview = json.loads(sdk_client.rest(
        path="/api/v1/licenses/overview",
        method="GET"
    ).text)

    logger.info(f"Retrieved the signed entitlement key from tenant '{sdk_client.config.host}'.")
    return license_overview["licenseKey"]


def create_tenant(sdk_client, license_key):
    tenant = json.loads(sdk_client.rest(
        path="/api/v1/tenants",
        method="POST",
        data={"licenseKey": license_key}
    ).text)

    tenant_id = tenant["id"]
    tenant_hostname = tenant['hostnames'][0]

    logger.info(f"Created tenant '{tenant_hostname}' with ID '{tenant_id}'.")

    return tenant_id, tenant_hostname


def check_access_to_tenant(sdk_client, tenant_id):
    user = sdk_client.users.get_me()
    if user["tenantId"] != tenant_id:
        raise RuntimeError(
            f"The tenant '{sdk_client.config.host}' does not have the expected ID: '{tenant_id}' != '{user['tenantId']}'.")

    logger.info(f"Successfully accessed tenant '{sdk_client.config.host}'.")


def create_tenant_admin(source_tenant_sdk_client, target_tenant_sdk_client, source_tenant_admin_email):
    source_tenant_admin_user = None
    for user in source_tenant_sdk_client.users.get_users(status=None, filter=f"email eq \"{source_tenant_admin_email}\"").pagination:
        source_tenant_admin_user = user

    if not source_tenant_admin_user:
        raise RuntimeError(
            f"No user with email '{source_tenant_admin_email}' exists in the tenant '{source_tenant_sdk_client.config.host}'.")

    logger.info(
        f"Retrieved user for email '{source_tenant_admin_email}' from tenant '{source_tenant_sdk_client.config.host}'.")

    if constants.ROLE_TENANT_ADMIN not in source_tenant_admin_user.roles:
        raise RuntimeError(
            f"The user with email '{source_tenant_admin_email}' is not a tenant admin in the tenant '{source_tenant_sdk_client.config.host}.")

    target_tenant_roles = json.loads(target_tenant_sdk_client.rest(
        path="/api/v1/roles",
        method="GET"
    ).text)["data"]

    logger.info(f"Retrieved roles from tenant '{target_tenant_sdk_client.config.host}'.")

    target_tenant_admin_role_id = None
    for role in target_tenant_roles:
        if role["name"] == constants.ROLE_TENANT_ADMIN:
            target_tenant_admin_role_id = role["id"]
            break

    if not target_tenant_admin_role_id:
        raise RuntimeError(
            f"No role with the name '{constants.ROLE_TENANT_ADMIN}' exists in the tenant '{target_tenant_sdk_client.config.host}'.")

    user = target_tenant_sdk_client.users.create(UserPostSchema(
        name=source_tenant_admin_user.name,
        email=source_tenant_admin_user.email,
        subject=source_tenant_admin_user.subject,
        assignedRoles=[{"id": target_tenant_admin_role_id}]
    ))

    logger.info(
        f"Created tenant admin user for user with email '{source_tenant_admin_email}' with ID '{user.id}' in tenant '{target_tenant_sdk_client.config.host}'.")


def run(source_tenant_sdk_client, tenant_registration_sdk_client, oauth_client_id, oauth_secret,
        source_tenant_admin_email):
    license_key = get_signed_entitlement_key(source_tenant_sdk_client)
    tenant_id, tenant_hostname = create_tenant(tenant_registration_sdk_client, license_key)

    target_tenant_sdk_client = qlik_sdk_helper.create_sdk_client(oauth_client_id, oauth_secret, tenant_hostname)
    check_access_to_tenant(target_tenant_sdk_client, tenant_id)

    if source_tenant_admin_email:
        create_tenant_admin(source_tenant_sdk_client, target_tenant_sdk_client, source_tenant_admin_email)

    logger.info(f"The tenant '{target_tenant_sdk_client.config.host}' has been created.")

    return target_tenant_sdk_client


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    add_log_level_argument(parser)

    parser.add_argument("--client-id", required=True, help="The OAuth client ID.")
    parser.add_argument("--client-secret", required=True, help="The OAuth client secret.")
    parser.add_argument("--tenant-registration-hostname", required=True,
                        help="The Qlik tenant registration hostname, for example: register.<REGION>.qlikcloud.com")

    source_tenant_group = parser.add_argument_group("Source Tenant Information")
    source_tenant_group.add_argument("--source-tenant-hostname", required=True,
                                     help="The hostname of the source tenant, for example: tenant.region.qlikcloud.com")
    source_tenant_group.add_argument("--source-tenant-admin-email", required=False,
                                     help="The email address of a tenant admin in the source tenant. If this is provided the tenant admin from the source tenant will be given access to the new tenant.")
    args = parser.parse_args()
    logging.basicConfig(level=args.log_level)

    source_tenant_sdk_client = qlik_sdk_helper.create_sdk_client(args.client_id, args.client_secret,
                                                                 args.source_tenant_hostname)
    tenant_registration_sdk_client = qlik_sdk_helper.create_sdk_client(args.client_id, args.client_secret,
                                                                       args.tenant_registration_hostname)

    run(source_tenant_sdk_client, tenant_registration_sdk_client, args.client_id, args.client_secret,
        args.source_tenant_admin_email)
