#!/bin/bash

. constants.env

source ./shared_functions.sh

function setup_access_tokens() {
  set_oauth_token "${SOURCE_TENANT_HOSTNAME}" "SOURCE_TENANT_ACCESS_TOKEN"
  set_oauth_token "${TARGET_TENANT_HOSTNAME}" "TARGET_TENANT_ACCESS_TOKEN"
}

function verify_bot_access_to_source_app() {
  local space_id
  if ! space_id=$(curl --fail-with-body -s -L \
                    -X GET "https://${SOURCE_TENANT_HOSTNAME}/api/v1/apps/${SOURCE_APP_ID}" \
                    -H "Authorization: Bearer ${SOURCE_TENANT_ACCESS_TOKEN}" | jq -r -e '.attributes.spaceId')
  then
    echo "ERROR: failed to retrieve the space ID for the app with ID '${SOURCE_APP_ID}' on tenant '${SOURCE_TENANT_HOSTNAME}'."
    exit 1
  fi

  echo "INFO: Retrieved the space ID for the app with ID '${SOURCE_APP_ID}' on tenant '${SOURCE_TENANT_HOSTNAME}'."

  local user_id
  if ! user_id=$(curl --fail-with-body -s -L \
                   -X GET "https://${SOURCE_TENANT_HOSTNAME}/api/v1/users/me" \
                   -H "Authorization: Bearer ${SOURCE_TENANT_ACCESS_TOKEN}" | jq -r -e '.id');
  then
    echo "ERROR: Failed retrieved the user ID from tenant '${SOURCE_TENANT_HOSTNAME}'."
    exit 1
  fi

  local create_response
  if ! create_response=$(curl --fail-with-body -s -L \
                           -X POST "https://${SOURCE_TENANT_HOSTNAME}/api/v1/spaces/${space_id}/assignments" \
                           -H "Authorization: Bearer ${SOURCE_TENANT_ACCESS_TOKEN}" \
                           -H "Accept: application/json" \
                           -H "Content-Type: application/json" \
                           -d '{
                                  "type": "user",
                                  "assigneeId": "'"${user_id}"'",
                                  "roles": ["consumer"]
                               }');
  then
    if [[ "$(echo "${create_response}" | jq -r -e '.code')" == "AssignmentConflict" ]];
    then
      echo "INFO: The user with ID '${user_id}' is already assigned to the space with ID '${space_id}' in tenant '${SOURCE_TENANT_HOSTNAME}'."
    else
      echo "ERROR: Failed to assign user with ID '${user_id}' to the space with ID '${space_id}' in tenant '${SOURCE_TENANT_HOSTNAME}': ${create_response}"
      exit 1
    fi
  else
    echo "INFO: The user with ID '${user_id}' has been assigned to the space with ID '{space_id}' with the 'producer' role in tenant '${SOURCE_TENANT_HOSTNAME}'."
  fi
}

function export_app() {
  local app_name
  if ! app_name=$(curl --fail-with-body -s -L \
                    -X GET "https://${SOURCE_TENANT_HOSTNAME}/api/v1/apps/${SOURCE_APP_ID}" \
                    -H "Authorization: Bearer ${SOURCE_TENANT_ACCESS_TOKEN}" | jq -r -e '.attributes.name');
  then
    echo "ERROR: Failed to retrieve the app with ID '${SOURCE_APP_ID}' from tenant '${SOURCE_TENANT_HOSTNAME}'."
    exit 1
  fi

  local location_header
  if ! location_header=$(curl --fail-with-body -s -I -L \
                           -X POST "https://${SOURCE_TENANT_HOSTNAME}/api/v1/apps/${SOURCE_APP_ID}/export" \
                           -H "Authorization: Bearer ${SOURCE_TENANT_ACCESS_TOKEN}" \
                           -H "Content-Type: application/octet-stream" | grep -i "Location" | tr -d '\r');
  then
    echo "ERROR: Failed to export the app with ID '${SOURCE_APP_ID}' from tenant '${SOURCE_TENANT_HOSTNAME}'."
    exit 1
  fi

  local app_download_path="$(echo "${location_header}" | cut -d":" -f2 | tr -d ' ')"
  echo "INFO: Retrieved download location for the app with ID '${SOURCE_APP_ID}' from tenant '${SOURCE_TENANT_HOSTNAME}'."

  readonly exported_app_file="${SOURCE_APP_ID}.qvf"
  if ! curl --fail-with-body -s -L --output "${exported_app_file}" \
          -X GET "https://${SOURCE_TENANT_HOSTNAME}${app_download_path}" \
          -H "Authorization: Bearer ${SOURCE_TENANT_ACCESS_TOKEN}" \
          -H "Content-Type: application/octet-stream";
  then
    echo "ERROR: Failed to download app at path '${app_download_path}' from tenant '${SOURCE_TENANT_HOSTNAME}'."
    exit 1
  fi

  echo "INFO: Exported the app '${app_name}' with ID '${SOURCE_APP_ID}' from '${SOURCE_TENANT_HOSTNAME}' to '${exported_app_file}'."
}

function import_app() {
  local dev_space
  if ! dev_space=$(curl --fail-with-body -s -L \
                     -X GET "https://${TARGET_TENANT_HOSTNAME}/api/v1/spaces/${TARGET_TENANT_SHARED_SPACE_ID}" \
                    -H "Authorization: Bearer ${TARGET_TENANT_ACCESS_TOKEN}");
  then
    echo "ERROR: Failed to retrieve the space with ID '${TARGET_TENANT_SHARED_SPACE_ID}' from tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  fi

  if ! imported_app=$(curl --fail-with-body -s -L \
                        -X POST "https://${TARGET_TENANT_HOSTNAME}/api/v1/apps/import?spaceId=$(echo "${dev_space}" | jq -r '.id')" \
                        -H "Authorization: Bearer ${TARGET_TENANT_ACCESS_TOKEN}" \
                        -H "Content-Type: application/octet-stream" \
                        --data-binary "@${exported_app_file}");
  then
    echo "ERROR: Failed to import the file '${exported_app_file}' to tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  else
    readonly imported_app
    rm "${exported_app_file}"
  fi

  echo "INFO: Imported the app '${exported_app_file}' to the app '$(echo "${imported_app}" | jq -r '.attributes.name')' with ID '$(echo "${imported_app}" | jq -r '.attributes.id')' in space '$(echo "${dev_space}" | jq -r '.name')' with ID '$(echo "${dev_space}" | jq -r '.id')' in '${TARGET_TENANT_HOSTNAME}'."
}

function publish_app() {
  local prod_space
  if ! prod_space=$(curl --fail-with-body -s -L \
                      -X GET "https://${TARGET_TENANT_HOSTNAME}/api/v1/spaces/${TARGET_TENANT_MANAGED_SPACE_ID}" \
                      -H "Authorization: Bearer ${TARGET_TENANT_ACCESS_TOKEN}");
  then
    echo "ERROR: Failed to retrieve the space with ID '${TARGET_TENANT_MANAGED_SPACE_ID}' from tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  fi

  prod_space_id=$(echo "${prod_space}" | jq -r '.id')
  echo "INFO: Retrieved the space with ID '${prod_space_id}' from tenant '${TARGET_TENANT_HOSTNAME}'."

  if [[ "$(echo "${prod_space}" | jq -r -e '.type')" != "managed" ]];
  then
    echo "ERROR: The space ID '$(echo "${prod_space}" | jq -r '.id')' given for tenant '${TARGET_TENANT_HOSTNAME}' must be a managed space."
    exit 1
  fi

  imported_app_id=$(echo "${imported_app}" | jq -r '.attributes.id')

  if ! published_app=$(curl -s --fail-with-body -L \
                         -X POST "https://${TARGET_TENANT_HOSTNAME}/api/v1/apps/${imported_app_id}/publish" \
                         -H "Authorization: Bearer ${TARGET_TENANT_ACCESS_TOKEN}" \
                         -H "Accept: application/json" \
                         -H "Content-Type: application/json" \
                         -d '{"spaceId": "'"${prod_space_id}"'"}')
  then
    echo "ERROR: Failed to publish the app '$(echo "${imported_app}" | jq -r '.attributes.name')' with ID '${imported_app_id}' to tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  else
    readonly published_app
  fi

  echo "INFO: Published app '$(echo "${imported_app}" | jq -r -e '.attributes.name')' with ID '${imported_app_id}' to space '$(echo "${prod_space}" | jq -r '.name')' with app ID '$(echo "${published_app}" | jq -r '.attributes.id')' in '${TARGET_TENANT_HOSTNAME}'."
}

function verify_user_access_to_published_app() {
  # TODO: there's a timing issue when opening a published app, this should be fixed soon.
  local retry_count=0
  while [ "${retry_count}" -le 120 ];
  do
    if python ../sdk-python/jwt_auth.py \
                    --subject "temp_user" \
                    --name "temp_user" \
                    --email "temp_user@jwt.io" \
                    --issuer "${JWT_ISSUER}" \
                    --key-id "${JWT_KEY_ID}" \
                    --private-key "${JWT_PRIVATE_KEY}" \
                    --public-key "${JWT_PUBLIC_KEY}" \
                    --groups "${GROUP_ANALYTICS_CONSUMER}" \
                    --tenant-url "https://${TARGET_TENANT_HOSTNAME}" \
                    --path "/api/v1/apps/$(echo "${published_app}" | jq -e -r '.attributes.id')" \
                    --log-level ERROR;
    then
      break
    fi
    (( retry_count++ )) || true
    sleep 1
  done

  if [ "${retry_count}" -gt 120 ];
  then
    echo "ERROR: Failed to verify user access for the group '${GROUP_ANALYTICS_CONSUMER}' to the published app with ID '$(echo "${published_app}" | jq -r '.attributes.id')' in tenant '${TARGET_TENANT_HOSTNAME}'."
    exit 1
  fi

  echo "INFO: Verified user access for the group '${GROUP_ANALYTICS_CONSUMER}' to the published app with ID '$(echo "${published_app}" | jq -r '.attributes.id')' in tenant '${TARGET_TENANT_HOSTNAME}'."
  if [ "${retry_count}" -gt 0 ];
  then
      echo "WARNING: It took '${retry_count}' attempts to verify access to the published app."
  fi
}

function run() {
  check_required_vars

  setup_access_tokens
  verify_bot_access_to_source_app
  export_app
  import_app
  publish_app
  verify_user_access_to_published_app

  echo "INFO: Deployed and published an app from '${SOURCE_TENANT_HOSTNAME}' to '${TARGET_TENANT_HOSTNAME}'."
}

function usage() {
  echo ""
  echo "usage: ${0}} [--help] --client-id CLIENT_ID --client-secret CLIENT_SECRET --source-tenant-hostname SOURCE_TENANT_HOSTNAME --source-app-id SOURCE_APP_ID --target-tenant-hostname TARGET_TENANT_HOSTNAME --target-shared-space-id"
  echo "                                TARGET_SHARED_SPACE_ID --target-managed-space-id TARGET_MANAGED_SPACE_ID [--jwt-issuer JWT_ISSUER] [--jwt-key-id JWT_KEY_ID] [--jwt-private-key JWT_PRIVATE_KEY] [--jwt-public-key JWT_PUBLIC_KEY]"
  echo ""
  echo "optional arguments:"
  echo "  --help                Show this help message and exit."
  echo "  --client-id CLIENT_ID"
  echo "                        The OAuth client ID."
  echo "  --client-secret CLIENT_SECRET"
  echo "                        The OAuth client secret."
  echo ""
  echo "Source Tenant Information:"
  echo "  --source-tenant-hostname SOURCE_TENANT_HOSTNAME"
  echo "                        The hostname of the source tenant, for example: tenant.region.qlikcloud.com"
  echo "  --source-app-id SOURCE_APP_ID"
  echo "                        The ID of the app in the source tenant to deploy to the target tenant."
  echo ""
  echo "Target Tenant Information:"
  echo "  --target-tenant-hostname TARGET_TENANT_HOSTNAME"
  echo "                        The hostname of the target tenant to configure, for example: tenant.region.qlikcloud.com"
  echo "  --target-shared-space-id TARGET_SHARED_SPACE_ID"
  echo "                        increase output verbosity"
  echo "  --target-managed-space-id TARGET_MANAGED_SPACE_ID"
  echo "                        increase output verbosity"
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
      --source-tenant-hostname)
        readonly SOURCE_TENANT_HOSTNAME=$2
        shift 2
        ;;
      --source-app-id)
        readonly SOURCE_APP_ID=$2
        shift 2
        ;;
      --target-tenant-hostname)
        readonly TARGET_TENANT_HOSTNAME=$2
        shift 2
        ;;
       --target-shared-space-id)
         readonly TARGET_TENANT_SHARED_SPACE_ID=$2
         shift 2
         ;;
       --target-managed-space-id)
         readonly TARGET_TENANT_MANAGED_SPACE_ID=$2
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

  if [ -z "${SOURCE_TENANT_HOSTNAME}" ] ; then
    usage
    echo "ERROR: The argument '--source-tenant-hostname' is required."
    exit 1
  fi

  if [ -z "${SOURCE_APP_ID}" ] ; then
    usage
    echo "ERROR: The argument '--source-app-id' is required."
    exit 1
  fi

  if [ -z "${TARGET_TENANT_HOSTNAME}" ] ; then
    usage
    echo "ERROR: The argument '--target-tenant-hostname' is required."
    exit 1
  fi

  if [ -z "${TARGET_TENANT_SHARED_SPACE_ID}" ] ; then
    usage
    echo "ERROR: The argument '--target-shared-space-id' is required."
    exit 1
  fi

  if [ -z "${TARGET_TENANT_MANAGED_SPACE_ID}" ] ; then
    usage
    echo "ERROR: The argument '--target-managed-space-id' is required."
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
