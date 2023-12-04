# Pulumi Infrastructure as Code (IaC) for AWS and GCP Deployment

This repository contains Pulumi code to deploy a multi-tier infrastructure on AWS and GCP, including VPC, Lambda functions, DynamoDB, RDS, S3 bucket, and more. The infrastructure is designed for a serverless application with auto-scaling capabilities.

## Prerequisites

Before running the Pulumi code, make sure you have the following prerequisites installed and configured:

- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- [AWS CLI](https://aws.amazon.com/cli/)
- [GCP CLI](https://cloud.google.com/sdk/docs/install)

## Project Structure

The project is organized into several files:

- **index.ts**: The main Pulumi program that defines the infrastructure.
- **Pulumi.yaml**: Pulumi configuration file.
- **/assets**: Contains any local assets, such as scripts or configuration files.
- **/scripts**: Additional scripts used in the deployment process.

## Configuration

The configuration is managed through Pulumi Config, and the required parameters are defined in the following files:

- **aws.json**: AWS-specific configuration parameters.
- **gcp.json**: GCP-specific configuration parameters.
- **assignment-4.json**: General configuration parameters for the project.
- **rds.json**: Configuration parameters for RDS.
- **route53.json**: Configuration parameters for Route 53.
- **mailgun.json**: Configuration parameters for Mailgun.

Ensure that you set the necessary values in these configuration files before deploying the infrastructure.

## Deployment Steps

To deploy the infrastructure, follow these steps:

1. Clone this repository.
2. Install the Pulumi CLI and configure AWS and GCP credentials.
3. Set the required configuration values in the configuration files mentioned above.
4. Run the following commands:

   ```bash
   pulumi login
   pulumi up
   ```

   Follow the prompts to confirm and deploy the infrastructure.

## Additional Commands

- **Certificate Import Command:**

  To import the certificate into the AWS Certificate Manager, use the following command:

  ```bash
  aws acm import-certificate --certificate fileb:///Users/sparshramchandani/Downloads/demo.sparshramchandani.me/certificate.pem --private-key fileb://Users/sparshramchandani/Downloads/demo.sparshramchandani.me/demo.sparshramchandani.me/private.key --certificate-chain fileb://Users/sparshramchandani/Downloads/demo.sparshramchandani.me/demo.sparshramchandani.me/ca_bundle.pem
  ```

## Cleanup

To clean up and delete the deployed resources, run:

```bash
pulumi destroy
pulumi stack rm
```

Follow the prompts to confirm the deletion.

## Outputs

After a successful deployment, the VPC ID and Launch Template ID are exported as outputs. These values can be used in other projects or scripts that depend on this infrastructure.

- **VPC ID:** `pulumi stack output vpcId`
- **Launch Template ID:** `pulumi stack output launchTemplateId`

## Conclusion

This Pulumi project provides a scalable and secure infrastructure for a serverless application on AWS and GCP. Feel free to modify the code to fit your specific requirements. For more information on Pulumi, refer to the [official documentation](https://www.pulumi.com/docs/).