"""
This class provides JWT authorization against a Qlik Cloud tenant.
"""

import argparse
import logging
import os
import datetime
import uuid
from dataclasses import dataclass

import jwt
import requests
from argparse_logging import add_log_level_argument

logger = logging.getLogger(__name__)


@dataclass
class JwtIdpConfig:
    issuer: str
    key_id: str
    private_key_file_path: str
    public_key_file_path: str

    def validate(self):
        if not self.issuer:
            logger.error("The JWT issuer field is required.")
            return False

        if not self.key_id:
            logger.error("The JWT key ID is required.")
            return False

        if not self.private_key_file_path:
            logger.error("The JWT private key file path is required.")
            return False

        if not os.path.exists(self.private_key_file_path) or not os.path.isfile(self.private_key_file_path):
            logger.error(f"The JWT private key file path '{self.private_key_file_path}' can't be read.")
            return False

        if not self.public_key_file_path:
            logger.error("The JWT public key file path is required.")
            return False

        if not os.path.exists(self.public_key_file_path) or not os.path.isfile(self.public_key_file_path):
            logger.error(f"The JWT public key file path '{self.private_key_file_path}' can't be read.")
            return False

        return True


class JwtAuth:
    session = None

    def __init__(self, host, jwt_idp_config, subject="jwt_test_user_1", name="JWT Test User 1",
                 email="jwt_test_user_1@jwt.io", email_verified=True, groups=("jwt_test_group_1", "jwt_test_group_2"),
                 expires_in=60):
        self.host = host.strip("/")
        self.jwt_idp_config = jwt_idp_config
        self.subject = subject
        self.name = name
        self.email = email
        self.email_verified = email_verified
        self.groups = list(groups)
        self.expires_in = expires_in

    def rest(self, path, method, data=None, params=None, headers=None):
        response = self._get_session().request(method, self.host + path, params, data, headers)
        response.raise_for_status()

        return response

    def _get_session(self):
        current_time = datetime.datetime.now(tz=datetime.timezone.utc)
        if not self.session:
            claims = {
                "sub": self.subject,
                "nbf": current_time,
                "iat": current_time,
                "jti": str(uuid.uuid4()),
                "name": self.name,
                "email": self.email,
                "email_verified": self.email_verified,
                "iss": self.jwt_idp_config.issuer,
                "exp": current_time + datetime.timedelta(seconds=self.expires_in),
                "aud": "qlik.api/login/jwt-session",
            }

            if self.groups:
                claims["groups"] = self.groups

            private_key = open(self.jwt_idp_config.private_key_file_path, "rb").read()
            token = jwt.encode(claims,
                               private_key,
                               algorithm="RS256",
                               headers={"alg": "RS256",
                                        "kid": self.jwt_idp_config.key_id,
                                        "typ": "JWT"})
            session = requests.Session()
            session.headers.update({"Authorization": "Bearer " + token})
            response = session.post(f"{self.host}/login/jwt-session")
            try:
                response.raise_for_status()
            except Exception:
                logger.error(f"JWT session failed: {response.text}\n{claims}")
                raise
            else:
                self.session = session

        return self.session


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Invokes the provided endpoint using JWT authentication.")
    add_log_level_argument(parser)
    parser.add_argument("--tenant-url", required=True,
                        help="The URL of the tenant to start a JWT authorization session with.")
    parser.add_argument("--path", required=False, default="/api/v1/users/me", help="The URL path to invoke.")
    parser.add_argument("--method", required=False, default="GET", help="The HTTP method to use for the request.")
    parser.add_argument("--data", required=False, default=None,
                        help="For POST or PUT methods this is the payload of the request.")
    parser.add_argument("--params", required=False, default=None, help="HTTP query parameters for the request.")
    parser.add_argument("--headers", required=False, default=None, help="HTTP headers for the request.")

    jwt_group = parser.add_argument_group("Tenant JWT IdP Configuration")
    jwt_group.add_argument("--issuer", required=True, help="The 'issuer' field to use in the JWT.")
    jwt_group.add_argument("--key-id", required=True, help="The 'kid' field to use in the JWT.")
    jwt_group.add_argument("--private-key", required=True, help="The path to the local private key file.")
    jwt_group.add_argument("--public-key", required=True, help="The path to the local public key file.")

    jwt_claims = parser.add_argument_group("JWT Claims")
    jwt_claims.add_argument("--subject", required=False, default="jwt_test_user",
                            help="The 'subject' field to use in the JWT claim.")
    jwt_claims.add_argument("--name", required=False, default="JWT Test User",
                            help="The 'name' field to use in the JWT claim.")
    jwt_claims.add_argument("--email", required=False, default="jwt_test_user@jwt.io",
                            help="The 'email' field to use in the JWT claim.")
    jwt_claims.add_argument("--email_verified", required=False, default=True, type=bool,
                            help="The 'email_verified' field to use in the JWT claim.")
    jwt_claims.add_argument("--groups", required=False, default=["jwt_test_group"], nargs='+',
                            help="The 'groups' field to use in the JWT claim (multiple groups can be specified).")
    jwt_claims.add_argument("--expires_in", required=False, default=60, type=int,
                            help="The 'expires_in' field to use in the JWT.")

    args = parser.parse_args()
    logging.basicConfig(level=args.log_level)

    jwt_idp_config = JwtIdpConfig(args.issuer, args.key_id, args.private_key, args.public_key)
    if not jwt_idp_config.validate():
        parser.print_help()
        exit(1)

    jwt_auth = JwtAuth(args.tenant_url, jwt_idp_config, args.subject, args.name, args.email, args.email_verified,
                       args.groups, args.expires_in)
    try:
        response = jwt_auth.rest(
            path=args.path,
            method=args.method,
            data=args.data,
            params=args.params,
            headers=args.headers)
    except Exception as e:
        logger.exception(
            f"Failed to invoke the path '{args.path}' for tenant {args.tenant_url} using the provide JWT information.")
        exit(1)
    else:
        logger.info(
            f"Invoked the path '{args.path}' for tenant {args.tenant_url} using the provide JWT information. Response: HTTP {response.status_code}: {response.text}.")
