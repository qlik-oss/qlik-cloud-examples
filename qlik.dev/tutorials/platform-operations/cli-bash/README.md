## Qlik CLI Examples

Example [Qlik CLI](https://qlik.dev/libraries-and-tools/qlik-cli) implementations of various tutorials from [Qlik Platform Operations tutorials](https://qlik.dev/tutorials#platform-operations) on [qlik.dev](http://qlik.dev).

### Prerequisites
* Bash 5.1 or higher
* [Qlik CLI](https://qlik.dev/libraries-and-tools/qlik-cli) version `2.14.3` or higher is installed.
* [The JQ command-line JSON processor](https://github.com/stedolan/jq/wiki/Installation) is installed.
* The setup from the [Python examples](../sdk-python) has been completed.

### Running

* [Create a tenant](https://qlik.dev/tutorials/create-a-tenant), example usage:
    ```bash
    ./tenant_create.sh \
      --client-id <CLIENT_ID> \
      --client-secret <CLIENT_SECRET> \
      --tenant-registration-hostname register.<REGION>.qlikcloud.com \
      --source-tenant-hostname <HOSTNAME> \
      --source-tenant-admin-email <EMAIL>
    ```

* [Configure a tenant](https://qlik.dev/tutorials/configure-a-tenant), example usage:
    ```bash
    ./tenant_configure.sh \
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
    ./tenant_deploy_content.sh \
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

* Create, configure, and deploy content to a tenant - combines multiple examples into a single end to end execution, example usage:
    ```bash
    ./tenant_end_to_end.sh \
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
