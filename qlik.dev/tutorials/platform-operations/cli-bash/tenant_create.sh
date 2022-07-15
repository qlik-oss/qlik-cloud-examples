#!/bin/bash

. constants.env

function setup_cli_contexts() {
  # Setup the context for the source tenant
  if ! qlik context create \
         --oauth-client-id "${OAUTH_CLIENT_ID}" \
         --oauth-client-secret "${OAUTH_CLIENT_SECRET}" \
         --server "http://${SOURCE_TENANT_HOSTNAME}" "${SOURCE_TENANT_HOSTNAME}" > /dev/null 2>&1;
  then
    # Context already exists, update it.
    if ! qlik context update \
         --oauth-client-id "${OAUTH_CLIENT_ID}" \
         --oauth-client-secret "${OAUTH_CLIENT_SECRET}" \
         --server "https://${SOURCE_TENANT_HOSTNAME}" "${SOURCE_TENANT_HOSTNAME}" > /dev/null;
    then
      echo "ERROR: Failed to create Qlik CLI context for '${SOURCE_TENANT_HOSTNAME}'."
      exit 1
    fi
  fi

  # Setup the context for tenant registration
  if ! qlik context create \
         --oauth-client-id "${OAUTH_CLIENT_ID}" \
         --oauth-client-secret "${OAUTH_CLIENT_SECRET}" \
         --server "https://${TENANT_REGISTRATION_HOSTNAME}" "${TENANT_REGISTRATION_HOSTNAME}" > /dev/null 2>&1;
  then
    # Context already exists, update it.
    if ! qlik context update \
         --oauth-client-id "${OAUTH_CLIENT_ID}" \
         --oauth-client-secret "${OAUTH_CLIENT_SECRET}" \
         --server "https://${TENANT_REGISTRATION_HOSTNAME}" "${TENANT_REGISTRATION_HOSTNAME}" > /dev/null;
    then
      echo "ERROR: Failed to create Qlik CLI context for '${TENANT_REGISTRATION_HOSTNAME}'."
      exit 1
    fi
  fi
}

function get_license_key() {
  qlik context use "${SOURCE_TENANT_HOSTNAME}" > /dev/null

  if ! license_key=$(qlik license overview --json | jq -r -e '.licenseKey')
  then
    echo "ERROR: Failed to retrieve license key from '${SOURCE_TENANT_HOSTNAME}'."
    exit 1
  else
    readonly license_key
  fi

  echo "INFO: Retrieved the signed entitlement key from tenant '${SOURCE_TENANT_HOSTNAME}'."
}

function create_tenant() {
  qlik context use "${TENANT_REGISTRATION_HOSTNAME}" > /dev/null

  local tenant
  if ! tenant=$(qlik tenant create --licenseKey "${license_key}" --json)
  then
    echo "ERROR: Failed to create tenant using '${TENANT_REGISTRATION_HOSTNAME}'."
    exit 1
  else
    readonly new_tenant_hostname=$(echo "${tenant}" | jq -r -e '.hostnames[0]')
    readonly new_tenant_id=$(echo "${tenant}" | jq -r -e '.id')
  fi

  echo "INFO: Created tenant '${new_tenant_hostname}' with ID '${new_tenant_id}'."
}

function check_access_to_tenant() {
  qlik context use "${new_tenant_hostname}" > /dev/null

  local user_tenant_id
  if ! user_tenant_id=$(qlik user me | jq -r -e '.tenantId')
  then
    echo "ERROR: Failed to access tenant '${new_tenant_hostname}'."
    exit 1
  fi

  if [[ "${user_tenant_id}" != "${new_tenant_id}" ]];
  then
    echo "ERROR: The tenant '${new_tenant_hostname}' does not have the expected ID: '${new_tenant_id}' != '${user_tenant_id}'."
    exit 1
  fi

  echo "INFO: Successfully accessed tenant '${new_tenant_hostname}'."
}

function create_tenant_admin() {
  qlik context use "${SOURCE_TENANT_HOSTNAME}" > /dev/null

  # Retrieve the admin user info from the source tenant
  local source_tenant_admin_user
  if ! source_tenant_admin_user=$(qlik user filter --filter "email eq \"${SOURCE_TENANT_ADMIN_EMAIL}\"" | jq -e '.[0]')
  then
    echo "ERROR: No user with email '${SOURCE_TENANT_ADMIN_EMAIL}' exists in the tenant '${SOURCE_TENANT_HOSTNAME}'."
    exit 1
  fi

  echo "INFO: Retrieved user for email '${SOURCE_TENANT_ADMIN_EMAIL}' from tenant '${SOURCE_TENANT_HOSTNAME}'."

  # Retrieve the role ID for the TenantAdmin role in the newly created tenant
  qlik context use "${new_tenant_hostname}" > /dev/null

  local target_tenant_admin_role_id
  if ! target_tenant_admin_role_id=$(qlik role ls | jq -r -e '.[] | select(.name == "TenantAdmin").id')
  then
    echo "ERROR: Failed to retrieve the tenant admin role from tenant '${new_tenant_hostname}'."
    exit 1
  fi

  echo "INFO: Retrieved roles from tenant '${new_tenant_hostname}'."
  local tenant_admin_user_name=$(echo "${source_tenant_admin_user}" | jq -e -r '.name')
  local tenant_admin_user_email=$(echo "${source_tenant_admin_user}" | jq -e -r '.email')
  local tenant_admin_user_subject=$(echo "${source_tenant_admin_user}" | jq -e -r '.subject')
  local tenant_admin_user_assigned_roles="[{\"id\": \"${target_tenant_admin_role_id}\"}]"

  local user
  if ! user=$(qlik user create \
                --name "${tenant_admin_user_name}" \
                --email "${tenant_admin_user_email}" \
                --subject "${tenant_admin_user_subject}"\
                --assignedRoles "${tenant_admin_user_assigned_roles}")
  then
    echo "ERROR: Failed to create the tenant admin user in tenant '${new_tenant_hostname}'."
    exit 1
  fi

  echo "INFO: Created tenant admin user for user with email '${SOURCE_TENANT_ADMIN_EMAIL}' with ID '$(echo "${user}" | jq -e -r '.id')' in tenant '${new_tenant_hostname}'."
}

function run() {
  check_required_vars

  setup_cli_contexts
  get_license_key
  create_tenant

  # Setup the context for the new tenant
  if ! qlik context create \
         --oauth-client-id "${OAUTH_CLIENT_ID}" \
         --oauth-client-secret "${OAUTH_CLIENT_SECRET}" \
         --server "https://${new_tenant_hostname}" "${new_tenant_hostname}" > /dev/null 2>&1;
  then
    echo "ERROR: Failed to create Qlik CLI context for new tenant '${new_tenant_hostname}'."
  fi

  check_access_to_tenant

  if [ -n "${SOURCE_TENANT_ADMIN_EMAIL}" ] ; then
    create_tenant_admin
  fi

  echo "INFO: The tenant '${new_tenant_hostname}' has been created."
}

function usage() {
  echo ""
  echo "usage: ${0}.py [--help] --client-id CLIENT_ID --client-secret CLIENT_SECRET --tenant-registration-hostname TENANT_REGISTRATION_HOSTNAME --source-tenant-hostname SOURCE_TENANT_HOSTNAME"
  echo "                        [--source-tenant-admin-email SOURCE_TENANT_ADMIN_EMAIL]"
  echo ""
  echo "optional arguments:"
  echo "  --help                Show this help message and exit."
  echo "  --client-id CLIENT_ID"
  echo "                        The OAuth client ID."
  echo "  --client-secret CLIENT_SECRET"
  echo "                        The OAuth client secret."
  echo "  --tenant-registration-hostname TENANT_REGISTRATION_HOSTNAME"
  echo "                        The Qlik tenant registration hostname, for example: register.<REGION>.qlikcloud.com"
  echo ""
  echo "Source Tenant Information:"
  echo "  --source-tenant-hostname SOURCE_TENANT_HOSTNAME"
  echo "                        The hostname of the source tenant, for example: tenant.region.qlikcloud.com"
  echo "  --source-tenant-admin-email SOURCE_TENANT_ADMIN_EMAIL"
  echo "                        The email address of a tenant admin in the source tenant. If this is provided the tenant admin from the source tenant will be given access to the new tenant."
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
      *)
        echo "ERROR: Unsupported flag $1" >&2
        usage
        exit 1
        ;;
    esac
  done
}

function check_required_vars() {
  if [ -z "${OAUTH_CLIENT_ID}" ] ; then
    usage
    echo "ERROR: The argument '--client-id' is required."
    exit 1
  fi

  if [ -z "${OAUTH_CLIENT_SECRET}" ] ; then
    usage
    echo "ERROR: The argument '--client-secret' is required."
    exit 1
  fi

  if [ -z "${TENANT_REGISTRATION_HOSTNAME}" ] ; then
    usage
    echo "ERROR: The argument '--tenant-registration-hostname' is required."
    exit 1
  fi

  if [ -z "${SOURCE_TENANT_HOSTNAME}" ] ; then
    usage
    echo "ERROR: The argument '--source-tenant-hostname' is required."
    exit 1
  fi
}

if [ -z "${SOURCE_FUNCTIONS_ONLY}" ] ; then
  if ! ./check-prerequisites.sh;
  then
    echo "ERROR: Some prerequisites have not been installed."
    exit 1
  fi

  parse_script_args "$@"
  run "$@"
fi
