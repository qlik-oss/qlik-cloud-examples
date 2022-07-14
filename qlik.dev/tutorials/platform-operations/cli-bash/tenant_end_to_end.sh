#!/bin/bash

function usage() {
  echo ""
  echo "usage: tenant_end_to_end.py [--help] --client-id CLIENT_ID --client-secret CLIENT_SECRET --tenant-registration-hostname TENANT_REGISTRATION_HOSTNAME [--jwt-issuer JWT_ISSUER] [--jwt-key-id JWT_KEY_ID]"
  echo "                            [--jwt-private-key JWT_PRIVATE_KEY] [--jwt-public-key JWT_PUBLIC_KEY] --source-tenant-hostname SOURCE_TENANT_HOSTNAME [--source-tenant-admin-email SOURCE_TENANT_ADMIN_EMAIL] --source-app-id SOURCE_APP_ID"
  echo ""
  echo "optional arguments:"
  echo "  --help                Show this help message and exit."
  echo "  --client-id CLIENT_ID"
  echo "                        The OAuth Client ID."
  echo "  --client-secret CLIENT_SECRET"
  echo "                        The OAuth client secret."
  echo "  --tenant-registration-hostname TENANT_REGISTRATION_HOSTNAME"
  echo "                        The Qlik tenant registration hostname, for example: register.<REGION>.qlikcloud.com"
  echo ""
  echo "Target Tenant JWT IdP Configuration:"
  echo "  --jwt-issuer JWT_ISSUER"
  echo "                        The 'issuer' field to use in the JWT."
  echo "  --jwt-key-id JWT_KEY_ID"
  echo "                        The 'kid' field to use in the JWT."
  echo "  --jwt-private-key JWT_PRIVATE_KEY"
  echo "                        The path to the local private key file."
  echo "  --jwt-public-key JWT_PUBLIC_KEY"
  echo "                        The path to the local public key file."
  echo ""
  echo "Source Tenant Info:"
  echo "  --source-tenant-hostname SOURCE_TENANT_HOSTNAME"
  echo "                        The hostname of the source tenant, for example: tenant.region.qlikcloud.com"
  echo "  --source-tenant-admin-email SOURCE_TENANT_ADMIN_EMAIL"
  echo "                        The email address of a tenant admin in the source tenant. If this is provided the tenant admin from the source tenant will be given access to the new tenant."
  echo "  --source-app-id SOURCE_APP_ID"
  echo "                        The ID of the app in the source tenant to deploy to the target tenant."
  echo ""
}

function parse_script_args() {
  while (( "$#" )); do
    case "$1" in
      --help)
        usage
        exit 0
        ;;
      --client-id)
        readonly OAUTH_CLIENT_ID=$2
        shift 2
        ;;
      --client-secret)
        readonly OAUTH_CLIENT_SECRET=$2
        shift 2
        ;;
      --tenant-registration-hostname)
        readonly TENANT_REGISTRATION_HOSTNAME=$2
        shift 2
        ;;
      --source-tenant-hostname)
        readonly SOURCE_TENANT_HOSTNAME=$2
        shift 2
        ;;
      --source-tenant-admin-email)
        readonly SOURCE_TENANT_ADMIN_EMAIL=$2
        shift 2
        ;;
      --source-app-id)
        readonly SOURCE_APP_ID=$2
        shift 2
        ;;
      --target-tenant-url)
        readonly TARGET_TENANT_URL=$2
        shift 2
        ;;
      --jwt-issuer)
        readonly JWT_ISSUER=$2
        shift 2
        ;;
      --jwt-key-id)
        readonly JWT_KEY_ID=$2
        shift 2
        ;;
      --jwt-private-key)
        readonly JWT_PRIVATE_KEY=$2
        shift 2
        ;;
      --jwt-public-key)
        readonly JWT_PUBLIC_KEY=$2
        shift 2
        ;;
      *)
        echo "ERROR: Unsupported flag $1" >&2
        usage
        exit 1
        ;;
    esac
  done
}

if ! ./check-prerequisites.sh;
then
  echo "ERROR: Some prerequisites have not been installed."
  exit 1
fi

parse_script_args "$@"

SOURCE_FUNCTIONS_ONLY="true"
source ./tenant_create.sh
run

TARGET_TENANT_HOSTNAME="${new_tenant_hostname}"
source ./tenant_configure.sh
run

TARGET_TENANT_SHARED_SPACE_ID="${new_shared_space_id}"
TARGET_TENANT_MANAGED_SPACE_ID="${new_managed_space_id}"
source ./tenant_deploy_content.sh
run

echo "INFO: Successfully completed an end to end run."

