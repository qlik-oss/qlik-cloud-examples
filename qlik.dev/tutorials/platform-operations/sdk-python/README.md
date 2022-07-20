## Qlik Python SDK Examples

Example Python implementations of various tutorials from [Qlik Platform Operations tutorials](https://qlik.dev/tutorials#platform-operations) on [qlik.dev](http://qlik.dev).

### Prerequisites
* Python 3.8 or higher
* Private and public key files have been created for JWT authorization as described [here](https://qlik.dev/tutorials/create-signed-tokens-for-jwt-authorization)

### Setup
All requirements are contained in the `requirements.txt` file. Below is an example setup with [Conda](https://docs.conda.io/projects/conda/en/latest/index.html):

```
conda create --name qlik-platform-ops-examples python=3.8
conda activate qlik-platform-ops-examples
pip install -r requirements.txt
```

### Running

* [Create a tenant](https://qlik.dev/tutorials/create-a-tenant), example usage:
    ```bash
    python tenant_create.py \
      --client-id <CLIENT_ID> \
      --client-secret <CLIENT_SECRET> \
      --tenant-registration-hostname register.<REGION>.qlikcloud.com \
      --source-tenant-hostname <HOSTNAME> \
      --source-tenant-admin-email <EMAIL>
    ```

* [Configure a tenant](https://qlik.dev/tutorials/configure-a-tenant), example usage:
    ```bash
    python tenant_configure.py \
      --client-id <CLIENT_ID> \
      --client-secret <CLIENT_SECRET> \
      --target-tenant-hostname <HOSTNAME> \ 
      --jwt-issuer <ISSUER> \
      --jwt-key-id <KEY_ID> \
      --jwt-private-key ./privatekey.pem \ 
      --jwt-public-key ./publickey.cer
    ```

* [Deploy a Qlik Sense application to a tenant](https://qlik.dev/tutorials/deploy-a-qlik-sense-application-to-a-tenant), example usage:
    ```bash
    python tenant_deploy_content.py \
      --client-id <CLIENT_ID> \
      --client-secret <CLIENT_SECRET> \
      --source-tenant-hostname <HOSTNAME> \
      --source-app-id <APP_ID> \
      --target-shared-space-id <SPACE_ID> \
      --target-managed-space-id <SPACE_ID> \ 
      --target-tenant-hostname <HOSTNAME> \
      --jwt-issuer <ISSUER> \
      --jwt-key-id <KEY_ID> \
      --jwt-private-key ./privatekey.pem \ 
      --jwt-public-key ./publickey.cer
    ```

* Embed a Qlik Sense application in an iFrame and access using JWT authentication, example usage:
    ```bash
    python ./tenant_embed_content.py \
      --client-id <CLIENT_ID> \
      --client-secret <CLIENT_SECRET> \
      --target-tenant-hostname <HOSTNAME> \
      --target-published-app-id "<APP_ID>" \
      --jwt-issuer <ISSUER> \
      --jwt-key-id <KEY_ID> \
      --jwt-private-key ./privatekey.pem \ 
      --jwt-public-key ./publickey.cer
    ```

* Create, configure, deploy, and embed content in a new tenant - combines multiple examples into a single end to end execution, example usage:
    ```bash
    python tenant_end_to_end.py \
      --client-id <CLIENT_ID> \
      --client-secret <CLIENT_SECRET> \
      --tenant-registration-hostname register.<REGION>.qlikcloud.com \
      --source-tenant-hostname <HOSTNAME> \
      --source-tenant-admin-email <EMAIL> \
      --source-app-id <APP_ID> 
      --jwt-issuer <ISSUER> \
      --jwt-key-id <KEY_ID> \
      --jwt-private-key ./privatekey.pem \ 
      --jwt-public-key ./publickey.cer
    ```
