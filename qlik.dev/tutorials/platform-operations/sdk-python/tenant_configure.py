"""
Implementation of the 'Configure a tenant' tutorial from https://qlik.dev/tutorials/configure-a-tenant

For a detailed overview of the supported arguments execute:

    python tenant_configure.py --help
"""
import argparse
import json
import logging

from argparse_logging import add_log_level_argument
from qlik_sdk import AssignmentCreate, SpaceCreate

import constants
import qlik_sdk_helper
from jwt_auth import JwtAuth, JwtIdpConfig

logger = logging.getLogger(__name__)


def get_tenant_id(sdk_client):
    user = sdk_client.users.get_me()

    logger.info(f"Retrieved tenant ID from tenant '{sdk_client.config.host}'.")
    return user["tenantId"]


def enable_auto_group_creation(sdk_client):
    sdk_client.rest(
        path="/api/v1/groups/settings",
        method="PATCH",
        data=[{
            "op": "replace",
            "path": "/autoCreateGroups",
            "value": True
        }])

    logger.info(f"Enabled group auto creation on tenant '{sdk_client.config.host}'.")


def enable_auto_license_assignment(sdk_client):
    sdk_client.rest(
        path="/api/v1/licenses/settings",
        method="PUT",
        data={
            "autoAssignProfessional": True,
            "autoAssignAnalyzer": True
        })

    logger.info(f"Enabled license auto assignment on tenant '{sdk_client.config.host}'.")


def configure_jwt_idp(sdk_client, jwt_idp_config):
    tenant_id = get_tenant_id(sdk_client)
    with open(jwt_idp_config.public_key_file_path, "r") as file:
        public_key = file.read().replace("\n", "")

    identity_provider = json.loads(sdk_client.rest(
        path="/api/v1/identity-providers",
        method="POST",
        data={
            "tenantIds": [tenant_id],
            "provider": "external",
            "protocol": "jwtAuth",
            "interactive": False,
            "active": True,
            "description": "IdP to handle deferred authentication.",
            "options": {
                "jwtLoginEnabled": True,
                "issuer": jwt_idp_config.issuer,
                "staticKeys": [
                    {
                        "kid": jwt_idp_config.key_id,
                        "pem": public_key
                    }
                ]
            }
        }).text)

    logger.info(
        f"Created JWT identity provider with ID '{identity_provider['id']}' in tenant '{sdk_client.config.host}'.")


def create_shared_space(sdk_client):
    space = sdk_client.spaces.create(SpaceCreate(
        name=constants.SPACE_SHARED_DEV,
        type="shared"))

    logger.info(f"Created the shared space '{space.name}' with ID '{space.id}' in tenant '{sdk_client.config.host}'.")
    return space


def create_managed_space(sdk_client):
    space = sdk_client.spaces.create(SpaceCreate(
        name=constants.SPACE_MANAGED_PROD,
        type="managed"))

    logger.info(f"Created the managed space '{space.name}' with ID '{space.id}' in tenant '{sdk_client.config.host}'.")
    return space


def create_group(sdk_client, group_name, jwt_idp_config):
    jwt_auth = JwtAuth(sdk_client.config.host,
                       jwt_idp_config,
                       subject="temp_user",
                       name="temp_user",
                       email="temp_user@jwt.io",
                       groups=[group_name])
    user = json.loads(jwt_auth.rest(
        path="/api/v1/users/me",
        method="GET").text)

    logger.info(
        f"Created a JWT authentication session for a user in group '{group_name}' in tenant '{sdk_client.config.host}'.")

    # Lookup the newly created group to get the ID
    groups = json.loads(sdk_client.rest(
        path="/api/v1/groups",
        method="GET").text)["data"]

    group_id = None
    for group in groups:
        if group["name"] == group_name:
            group_id = group["id"]
            break

    if not group_id:
        logger.error(f"The group {group_name} could not be found in tenant '{sdk_client.config.host}'.")

    logger.info(f"Created group '{group_name}' with ID '{group_id}' in '{sdk_client.config.host}'.")

    # Delete the temporary user, it's not needed
    sdk_client.rest(
        path=f"/api/v1/users/{user['id']}",
        method="DELETE")

    logger.info(f"Deleted temporary user with ID '{user['id']}' from '{sdk_client.config.host}'.")

    return group_id


def assign_to_space(sdk_client, space, group_id, roles):
    space.create_assignment(AssignmentCreate(
        type="group",
        assigneeId=group_id,
        roles=roles
    ))

    logger.info(
        f"Assigned the group with ID '{group_id}' to the space with ID '{space.id}' with the roles '{roles}' in tenant '{sdk_client.config.host}'.")


def run(target_tenant_sdk_client, jwt_idp_config):
    enable_auto_group_creation(target_tenant_sdk_client)
    enable_auto_license_assignment(target_tenant_sdk_client)

    configure_jwt_idp(target_tenant_sdk_client, jwt_idp_config)

    dev_space = create_shared_space(target_tenant_sdk_client)
    prod_space = create_managed_space(target_tenant_sdk_client)

    analytics_consumer_group_id = create_group(target_tenant_sdk_client, constants.GROUP_ANALYTICS_CONSUMER,
                                               jwt_idp_config)
    assign_to_space(target_tenant_sdk_client, prod_space, analytics_consumer_group_id, ["consumer"])

    logger.info(f"The tenant '{target_tenant_sdk_client.config.host}' has been configured.")
    return dev_space.id, prod_space.id


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    add_log_level_argument(parser)
    parser.add_argument("--client-id", required=True, help="The OAuth client ID.")
    parser.add_argument("--client-secret", required=True, help="The OAuth client secret.")
    parser.add_argument("--target-tenant-hostname", required=True,
                        help="The hostname of the target tenant to configure, for example: tenant.region.qlikcloud.com")

    jwt_group = parser.add_argument_group("Target JWT IdP Configuration")
    jwt_group.add_argument("--jwt-issuer", required=False, help="The 'issuer' field to use in the JWT.")
    jwt_group.add_argument("--jwt-key-id", required=False, help="The 'kid' field to use in the JWT.")
    jwt_group.add_argument("--jwt-private-key", required=False, help="The path to the local private key file.")
    jwt_group.add_argument("--jwt-public-key", required=False, help="The path to the local public key file.")

    args = parser.parse_args()
    logging.basicConfig(level=args.log_level)

    jwt_idp_config = JwtIdpConfig(args.jwt_issuer, args.jwt_key_id, args.jwt_private_key, args.jwt_public_key)
    if not jwt_idp_config.validate():
        parser.print_help()
        exit(1)

    target_tenant_sdk_client = qlik_sdk_helper.create_sdk_client(args.client_id, args.client_secret,
                                                                 args.target_tenant_hostname)

    run(target_tenant_sdk_client, jwt_idp_config)
