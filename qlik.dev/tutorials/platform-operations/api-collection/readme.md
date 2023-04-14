## API Collection Examples (Postman Example)

Example [Postman](https://www.postman.com/) API collection which demonstrates various tutorials from [Qlik Platform Operations tutorials](https://qlik.dev/manage/platform-operations/overview) on [qlik.dev](http://qlik.dev).

> **Note:** The example collection demonstrates the calls as documented, and as they do not abstract or automate activities like generating the access token from the OAuth clients - there will be repetition.

### Prerequisites
* [Postman](https://www.postman.com/), or an alternative API collection tool such as [Hoppscotch](https://hoppscotch.io/)
* The relevant input variables for the initial collection variables (these can be found in the collection definition)

### Running the collection

To run the whole collection, go to the collection Variables tab and set the variables as per the linked tutorial, which contains more detailed descriptions about each variable and example values. The collection uses javascript in `Tests` to assist with passing access tokens and other variables between steps, and also to confirm the expected response code for each request. Temporary variables are saved in the collection to help you explore the process, so after running the collection the collection variable list will be considerably larger.

Please note:

* If you encounter problems with the public and private key, ensure you have removed all line breaks.

* The runner will break at step 4.6 due to requiring a local binary file for the app import step.

* **Important:** Steps 3.5 and 3.6 in the collection leverage the [postman-util-lib](https://github.com/joolfe/postman-util-lib) library (MIT License). Before using this collection you should ensure you should review this third-party library.

The [Platform Operations collection](./Platform%20Operations%20Example.postman_collection.json) approximately aligns to the following documentation:

* [1 - Create a tenant](https://qlik.dev/tutorials/create-a-tenant)

* [2 - Add interactive user to a tenant](https://qlik.dev/tutorials/add-an-interactive-user-to-a-tenant)

* [3 - Configure a tenant](https://qlik.dev/tutorials/configure-a-tenant)

* [4 - Deploy a Qlik Sense application to a tenant](https://qlik.dev/tutorials/deploy-a-qlik-sense-application-to-a-tenant)
