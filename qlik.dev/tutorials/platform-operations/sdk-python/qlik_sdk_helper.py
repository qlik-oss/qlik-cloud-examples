"""
Helpers for interacting with Qlik SDK.
"""
import json
import logging

import requests
from qlik_sdk import AuthType, Config, Qlik

logger = logging.getLogger(__name__)


def create_sdk_client(oauth_client_id, oauth_secret, tenant_hostname):
    token_endpoint = f"https://{tenant_hostname}/oauth/token"
    response = requests.post(token_endpoint,
                             json={
                                 "client_id": oauth_client_id,
                                 "client_secret": oauth_secret,
                                 "grant_type": "client_credentials"
                             },
                             headers={"Content-type": "application/json", "Accept": "application/json"})
    response.raise_for_status()

    access_token = json.loads(response.text)["access_token"]
    logger.info(f"Fetched OAuth token from tenant '{token_endpoint}'.")

    # The AuthType.APIKey is used here, even though we're using an OAuth token. The end result is the same: an
    # Authorization header is set with the bearer set to the provided token. In the future the Config object
    # will support different authentication types explicitly.
    return Qlik(config=Config(
        host=f"https://{tenant_hostname}",
        auth_type=AuthType.APIKey,
        api_key=access_token))
