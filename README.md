# iac-pulumi

# Pulumi AWS VPC Deployment

This repository contains code for deploying an Amazon Web Services (AWS) Virtual Private Cloud (VPC) using Pulumi, an infrastructure as code (IaC) tool. The code creates a VPC with associated subnets, route tables, and an Internet Gateway. It is designed to be customized through configuration settings and can be deployed to the AWS region of your choice. Below is an overview of the code and how to use it.

## Prerequisites

Before you begin, make sure you have the following prerequisites installed:

- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- [Node.js](https://nodejs.org/) (for JavaScript/TypeScript)
- [AWS CLI](https://aws.amazon.com/cli/) with configured credentials
- [Pulumi AWS Plugin](https://www.pulumi.com/docs/get-started/install/aws/)

## Configuration

The code uses configuration settings to customize the VPC deployment. You need to provide the following configuration values:

- `region`: The AWS region in which to deploy the VPC.
- `vpcCidrBlock`: The IPv4 CIDR block for the VPC.
- `profile`: The AWS profile to use for authentication (from your AWS CLI configuration).

Make sure you have these values configured in your Pulumi stack configuration.

## Code Overview

### VPC Creation

The code begins by creating an AWS VPC named `myVpc` with the specified CIDR block. The VPC is tagged with a name based on the `selectedProfile` configuration.

### Subnet Creation

The code then creates both public and private subnets within the VPC. For each availability zone in the selected region, it creates a public subnet and a private subnet. The public subnet has auto-mapping of public IPs enabled. Subnet CIDR blocks are derived from the VPC CIDR block and availability zone index.

### Internet Gateway

An Internet Gateway named `myInternetGateway` is created and associated with the VPC. It is also tagged with a name based on the `selectedProfile` configuration.

### Route Tables

Two route tables, one for public and one for private, are created and associated with the VPC. 

- Public Route Table: It is used for public subnets, and a default route (`0.0.0.0/0`) is created pointing to the Internet Gateway.
- Private Route Table: It is used for private subnets.

### Route Table Associations

Route table associations are created for each subnet. Public subnets are associated with the public route table, and private subnets are associated with the private route table.

### Deployment

The code is structured to allow the creation of resources across multiple availability zones in the selected region, ensuring high availability and redundancy.

## Deployment

To deploy this code, follow these steps:

1. Make sure your Pulumi configuration settings are properly defined.
2. Navigate to the directory containing the code and execute the following commands:

   ```shell
   pulumi up
   ```

3. To destroy the VPC navigate to your directory containing the code and execute the following commands:
   
   ```shell
   pulumi destroy
   ```

4. Pulumi will prompt you to confirm the deployment. Type "yes" to proceed.

## Conclusion

This Pulumi code automates the creation of an AWS VPC with associated subnets, route tables, and an Internet Gateway. By customizing the configuration, you can adapt it to your specific AWS environment and requirements.

For more information on using Pulumi, refer to the [Pulumi Documentation](https://www.pulumi.com/docs/).
