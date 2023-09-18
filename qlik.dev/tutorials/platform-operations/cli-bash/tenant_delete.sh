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

function run() {
  check_required_vars

  setup_cli_contexts
  qlik context use "${TARGET_TENANT_HOSTNAME}" > /dev/null

  get_tenant_id
}