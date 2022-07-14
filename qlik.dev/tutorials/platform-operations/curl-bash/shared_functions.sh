#!/bin/bash

function set_oauth_token(){
  local tenant_hostname=$1
  local output_variable_name=$2

  # Only get an OAuth token if one isn't already assigned to output_variable_name
  if [ -z "${!output_variable_name}" ] ; then
    local token_endpoint="https://${tenant_hostname}/oauth/token"
    local access_token
    if ! access_token=$(curl --fail-with-body -s -L \
                          -X POST "${token_endpoint}" \
                          -H "Accept: application/json" \
                          -H "Content-Type: application/json" \
                          -d '{
                                "client_id": "'"${OAUTH_CLIENT_ID}"'",
                                "client_secret": "'"${OAUTH_CLIENT_SECRET}"'",
                                "grant_type":"client_credentials"
                              }' | jq -r -e '.access_token')
    then
      echo "ERROR: Failed to retrieve an OAuth access token from tenant '${tenant_hostname}'."
      exit 1
    fi

    # shellcheck disable=SC2059
    printf -v "${output_variable_name}" "${access_token}"
    readonly "${output_variable_name}"

    echo "INFO: Fetched OAuth token from tenant '${token_endpoint}'."
  fi
}
