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

function delete_tenant () {
    #To delete a tenant it first goes through a state of deactivation therefore you start by first deactivating the tenant then it eventually gets deleted. 
    qlik context use "${TARGET_TENANT_HOSTNAME}" > /dev/null
    if ! tenant=$(qlik tenant delete "${target_tenant_id}" --json)
    then
        echo "ERROR: Failed to delete tenant using '${target_tenant_id}'."
        exit 1
    else
    tenant= if ! purge_after_days=null $(--purgeAfterDays "${purge_after_days}"  )
    else 
    readonly purge_after_days="${purge_after_days}" 
    fi

    echo "INFO: Tenant deactivated '${TARGET_TENANT_HOSTNAME}' with ID '${target_tenant_id}' and will be deleted within '${purge_after_days}'."
}

function run() {
  check_required_vars

  setup_cli_contexts
  qlik context use "${TARGET_TENANT_HOSTNAME}" > /dev/null
  get_tenant_id

   if ! qlik tenant delete \

}

function parse_script_args() {
  while (( "$#" )); do
    case "$1" in
      --help)
        usage
        exit 0
        ;;
    esac
  done
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
