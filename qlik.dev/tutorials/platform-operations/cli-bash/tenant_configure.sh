#!/bin/bash

. constants.env

function setup_cli_contexts() {
  # Setup the context for the target tenant
  if ! qlik context create \
         --oauth-client-id "${OAUTH_CLIENT_ID}" \
         --oauth-client-secret "${OAUTH_CLIENT_SECRET}" \
         --server "https://${TARGET_TENANT_HOSTNAME}" "${TARGET_TENANT_HOSTNAME}" > /dev/null 2>&1;
  then
    # Context already exists, update it.
    if ! qlik context update \
         --oauth-client-id "${OAUTH_CLIENT_ID}" \
         --oauth-client-secret "${OAUTH_CLIENT_SECRET}" \
         --server "https://${TARGET_TENANT_HOSTNAME}" "${TARGET_TENANT_HOSTNAME}" > /dev/null;
    then
      echo "ERROR: Failed to create Qlik CLI context for tenant '${TARGET_TENANT_HOSTNAME}'."
      exit 1
    fi
  fi
}

function get_tenant_id() {
  if ! target_tenant_id=$(qlik user me | jq -r -e '.tenantId');
  then
    echo "ERROR: Failed retrieved the tenant ID from tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  else
    readonly target_tenant_id
  fi
  echo "INFO: Retrieved tenant ID from tenant '${TARGET_TENANT_HOSTNAME}'."
}

function enable_auto_group_creation() {
  if ! qlik group settings patch --body '[{"op":"replace","path":"/autoCreateGroups","value":true}]';
  then
    echo "ERROR: Enabling group auto creation on tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  fi
  echo "INFO: Enabled group auto creation on tenant '${TARGET_TENANT_HOSTNAME}'."
}

function enable_auto_license_assignment() {
  if ! qlik license settings update \
    --autoAssignAnalyzer=true \
    --autoAssignProfessional=true >/dev/null 2>&1; 
  then
    echo "ERROR: Enabling license auto assignment on tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  fi
  echo "INFO: Enabled license auto assignment on tenant '${TARGET_TENANT_HOSTNAME}'."

}

function configure_jwt_idp() {
  local public_key=$(<"${JWT_PUBLIC_KEY}" tr -d '\n' )

  local identity_provider
  if ! identity_provider=$(qlik identity-provider create jwtauth \
    --tenantIds="${target_tenant_id}" \
    --provider=external \
    --protocol=jwtAuth \
    --description="IdP to handle deferred authentication." \
    --options-issuer="$JWT_ISSUER" \
    --options-staticKeys=["{\"kid\": \"${JWT_KEY_ID}\", \"pem\": \"${public_key}\"}"]);
  then
    echo "ERROR: Failed to create JWT identity provider on tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  fi
  echo "INFO: Created JWT identity provider with ID $(echo ${identity_provider} | jq '.id') in tenant '${TARGET_TENANT_HOSTNAME}'."
}

function create_shared_space() {
  if ! new_shared_space_id=$(qlik space create --name="${SPACE_SHARED_DEV}" --type=shared | jq -r -e '.id');
  then
    echo "ERROR: Failed to create shared space '${SPACE_SHARED_DEV}'."
    exit 1
  else
    readonly new_shared_space_id
  fi
  echo "INFO: Created the shared space '${SPACE_SHARED_DEV}' with ID '${new_shared_space_id}' in tenant '${TARGET_TENANT_HOSTNAME}'."
}

function create_managed_space() {
  if ! new_managed_space_id=$(qlik space create --name="${SPACE_MANAGED_PROD}" --type=managed | jq -r -e '.id');
  then
    echo "ERROR: Failed to create managed space $SPACE_MANAGED_PROD"
    exit 1
  else
    readonly new_managed_space_id
  fi
  echo "INFO: Created the managed space '${SPACE_MANAGED_PROD}' with ID '${new_managed_space_id}' in tenant '${TARGET_TENANT_HOSTNAME}'."
}

function create_group() {
  if ! python ../sdk-python/jwt_auth.py \
          --issuer "${JWT_ISSUER}" \
          --key-id "${JWT_KEY_ID}" \
          --private-key "${JWT_PRIVATE_KEY}" \
          --public-key "${JWT_PUBLIC_KEY}" \
          --groups "${GROUP_ANALYTICS_CONSUMER}" \
          --tenant-url "http://${TARGET_TENANT_HOSTNAME}" \
          --log-level ERROR;
  then
    echo "ERROR: Failed to create the group '${GROUP_ANALYTICS_CONSUMER}' using JWT authorization in tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  fi

  echo "INFO: Created a JWT authentication session for a user in group '${GROUP_ANALYTICS_CONSUMER}' in tenant '${TARGET_TENANT_HOSTNAME}'."

  # Lookup the newly created group to get the ID
  if ! analytics_consumer_group_id=$(qlik group ls | jq -e -r --arg GROUP_NAME "${GROUP_ANALYTICS_CONSUMER}" '.[] | select(.name == $GROUP_NAME).id');
  then
    echo "ERROR: Failed to retrieve the group '${GROUP_ANALYTICS_CONSUMER}' from tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  else
    readonly analytics_consumer_group_id
  fi
  echo "INFO: Created group '${GROUP_ANALYTICS_CONSUMER}' with ID '${analytics_consumer_group_id}' in '${TARGET_TENANT_HOSTNAME}'."
}

function assign_to_space() {
  if ! qlik space assignment create \
      --type="group" \
      --assigneeId="${analytics_consumer_group_id}" \
      --roles="consumer" \
      --spaceId="${new_managed_space_id}" >/dev/null 2>&1;
  then
    echo "ERROR: Failed to assign group with ID '${analytics_consumer_group_id} to space with ID '${new_managed_space_id}' in tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  fi
  echo "INFO: Assigned the group with ID '${analytics_consumer_group_id}' to the space with ID '${new_managed_space_id}' in tenant '${TARGET_TENANT_HOSTNAME}'."
}

function run() {
  check_required_vars

  setup_cli_contexts
  qlik context use "${TARGET_TENANT_HOSTNAME}" > /dev/null

  get_tenant_id
  enable_auto_group_creation
  enable_auto_license_assignment
  configure_jwt_idp
  create_shared_space
  create_managed_space
  create_group
  assign_to_space
}

function usage() {
  echo ""
  echo "  usage: ${0} [--help] --client-id CLIENT_ID --client-secret CLIENT_SECRET --target-tenant-hostname TARGET_TENANT_HOSTNAME [--jwt-issuer JWT_ISSUER] [--jwt-key-id JWT_KEY_ID] [--jwt-private-key JWT_PRIVATE_KEY]"
  echo "                             [--jwt-public-key JWT_PUBLIC_KEY]"
  echo ""
  echo "  optional arguments:"
  echo "    --help                Show this help message and exit."
  echo "    --client-id CLIENT_ID"
  echo "                          The OAuth client ID."
  echo "    --client-secret CLIENT_SECRET"
  echo "                          The OAuth client secret."
  echo "    --target-tenant-hostname TARGET_TENANT_HOSTNAME"
  echo "                          The hostname of the target tenant to configure, for example: tenant.region.qlikcloud.com"
  echo ""
  echo "  Target JWT IdP Configuration:"
  echo "    --jwt-issuer JWT_ISSUER"
  echo "                          The 'issuer' field to use in the JWT."
  echo "    --jwt-key-id JWT_KEY_ID"
  echo "                          The 'kid' field to use in the JWT."
  echo "    --jwt-private-key JWT_PRIVATE_KEY"
  echo "                          The path to the local private key file."
  echo "    --jwt-public-key JWT_PUBLIC_KEY"
  echo "                          The path to the local public key file."
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
      --target-tenant-hostname)
        readonly TARGET_TENANT_HOSTNAME=$2
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

  if [ -z "${TARGET_TENANT_HOSTNAME}" ] ; then
    usage
    echo "ERROR: The argument '--target-tenant-hostname' is required."
    exit 1
  fi

  if [ -z "${JWT_ISSUER}" ] ; then
    usage
    echo "ERROR: The argument '--jwt-issuer' is required."
    exit 1
  fi

  if [ -z "${JWT_KEY_ID}" ] ; then
    usage
    echo "ERROR: The argument '--jwt-key-id' is required."
    exit 1
  fi

  if [ -z "${JWT_PRIVATE_KEY}" ] ; then
    usage
    echo "ERROR: The argument '--jwt-private-key' is required."
    exit 1
  fi

  if [ -z "${JWT_PUBLIC_KEY}" ] ; then
    usage
    echo "ERROR: The argument '--jwt-public-key' is required."
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
