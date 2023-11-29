const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const route53 = require("@pulumi/aws/route53");
const gcp = require("@pulumi/gcp");

const config = new pulumi.Config("aws");
const gcpConfig = new pulumi.Config("gcp");
const configure = new pulumi.Config("assignment-4");
const rds = new pulumi.Config("rds");
const route53Config = new pulumi.Config("route53");
const mailgunConfig = new pulumi.Config("mailgun");

const strOwners = new pulumi.Config("ami").require("owners");
const owners = strOwners.split();

const selectedRegion = config.require("region");
const vpcCidrBlock = configure.require("vpcCidrBlock");
const selectedProfile = config.require("profile");

const keyName = new pulumi.Config("keyName").require("key");

var splittedCidrBlock = vpcCidrBlock.split("/");
var vpcMask = parseInt(splittedCidrBlock[1]);
const vpcCidrParts = splittedCidrBlock[0].split(".");

const vpc = new aws.ec2.Vpc("myVpc", {
  cidrBlock: vpcCidrBlock,
  tags: {
    Name: `${selectedProfile}-vpc`,
  },
});

const createVpcAndSubnets = async () => {

  const gcsBucket = new gcp.storage.Bucket("gcsBucket", {
    name: "csye6225demolambdabucket",
    location: "us",
    forceDestroy: true,
    versioning: {
      enabled: true,
    },
  });

  const topic = new aws.sns.Topic("serverless", {
    displayName: "serverless",
  });

  const lambdaRole = new aws.iam.Role("LambdaFunctionRole", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Service: ["lambda.amazonaws.com"],
          },
          Action: ["sts:AssumeRole"],
        },
      ],
    }),
  });
  const lambdaPolicyArns = [
    "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
    "arn:aws:iam::aws:policy/AmazonS3FullAccess",
    "arn:aws:iam::aws:policy/AWSLambda_FullAccess",
    "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
  ];

  const cloudWatchLogsAttachment = new aws.iam.RolePolicyAttachment(
    "lambdaPolicy-CloudWatchLogs",
    {
      role: lambdaRole.name,
      policyArn: lambdaPolicyArns[0],
    }
  );

  const s3FullAccessAttachment = new aws.iam.RolePolicyAttachment(
    "lambdaPolicy-S3FullAccess",
    {
      role: lambdaRole.name,
      policyArn: lambdaPolicyArns[1],
    }
  );

  const lambdaFullAccessAttachment = new aws.iam.RolePolicyAttachment(
    "lambdaPolicy-LambdaFullAccess",
    {
      role: lambdaRole.name,
      policyArn: lambdaPolicyArns[2],
    }
  );

  const dynamoDBFullAccessAttachment = new aws.iam.RolePolicyAttachment(
    "lambdaPolicy-DynamoDBFullAccess",
    {
      role: lambdaRole.name,
      policyArn: lambdaPolicyArns[3],
    }
  );

  const secretsManagerPolicy = new aws.iam.Policy("secretsManagerPolicy", {
    policy: {
        Version: "2012-10-17",
        Statement: [{
            Action: "secretsmanager:*", // Use the wildcard to allow any action
            Effect: "Allow",
            Resource: "*", // Use the wildcard to allow access to any resource
        }],
    },
});

const secretManagerFullAccessAttachment = new aws.iam.RolePolicyAttachment("secretsManagerPolicyAttachment", {
  policyArn: secretsManagerPolicy.arn,
  role: lambdaRole.name,
});

  const topicPolicy = new aws.iam.Policy("EC2TopicAccessPolicy", {
    policy: {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowEC2ToPublishToSNSTopic",
          Effect: "Allow",
          Action: ["sns:Publish", "sns:CreateTopic"],
          Resource: topic.arn,
        },
      ],
    },
    roles: [lambdaRole],
  });

  const serviceAccount = new gcp.serviceaccount.Account("myServiceAccount", {
    accountId: "gcp-bucket-service-account",
    displayName: "GCP Bucket Service Account",
  });
  const bucketAccess = new gcp.storage.BucketIAMBinding("bucketAccess", {
    bucket: gcsBucket.name,
    role: "roles/storage.objectAdmin",
    members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
  });
  const serviceAccountKeys = new gcp.serviceaccount.Key("myServiceAccountKeys", {
    serviceAccountId: serviceAccount.id,
  });

  // Create a DynamoDB table
const dynamoDBTable = new aws.dynamodb.Table("dynamoDBTable", {
  name: "Csye6225_Demo_DynamoDB",
  attributes: [
    {
      name: "id",
      type: "S",
    },
    {
      name: "status",
      type: "S",
    },
    {
      name: "timestamp",
      type: "S",
    },
  ],
  hashKey: "id",
  rangeKey: "status",
  readCapacity: 5,
  writeCapacity: 5,
  globalSecondaryIndexes: [
    {
      name: "TimestampIndex",
      hashKey: "timestamp",
      rangeKey: "id",
      projectionType: "ALL",
      readCapacity: 5,
      writeCapacity: 5,
    },
  ],
});

// Create an IAM policy for DynamoDB access
const dynamoDBPolicy = new aws.iam.Policy("DynamoDBAccessPolicy", {
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query", // Add other necessary actions
        ],
        Resource: dynamoDBTable.arn,
      },
    ],
  },
});

const dynamoDBPolicyAttachment = new aws.iam.PolicyAttachment(
  "DynamoDBPolicyAttachment",
  {
    policyArn: dynamoDBPolicy.arn,
    roles: [lambdaRole.name],
    dependsOn: [dynamoDBTable], // Assuming lambdaRole is the execution role for your Lambda function
  }
);

const lambdaFunction = new aws.lambda.Function("LambdaFunction", {
  functionName: "serverless",
  role: lambdaRole.arn,
  runtime: "nodejs16.x",
  handler: "index.handler",
  code: new pulumi.asset.FileArchive("/Users/sparshramchandani/Documents/Sem_4/Cloud/Assignments/Assignment_9/serverless-forked/serverless.zip"),
  environment: {
    variables: {
      GCP_PRIVATE_KEY: serviceAccountKeys.privateKey,
      GCS_BUCKET_NAME: gcsBucket.name,
      DYNAMODB_TABLE_NAME:dynamoDBTable.name,
      GCP_PROJECT_ID: gcpConfig.require("project"),
      MAILGUN_DOMAIN: route53Config.require("domainName"),
      REGION: config.require("region"),
    },
  },
});

new aws.sns.TopicSubscription(`SNSSubscription`, {
  topic: topic.arn,
  protocol: "lambda",
  endpoint: lambdaFunction.arn,
});

new aws.iam.PolicyAttachment("topicPolicyAttachment", {
  policyArn: topicPolicy.arn,
  roles: [lambdaRole.name],
});

new aws.lambda.Permission("with_sns", {
  statementId: "AllowExecutionFromSNS",
  action: "lambda:InvokeFunction",
  function: lambdaFunction.name,
  principal: "sns.amazonaws.com",
  sourceArn: topic.arn,
});

  const azs = await aws.getAvailabilityZones({
    state: "available",
    region: selectedRegion,
  });
  const availabilityZones = azs.names.slice(
    0,
    azs.names.length < 3 ? azs.names.length : 3
  );

  const { publicSubnets, privateSubnets } = availabilityZones.reduce(
    (
      result: { publicSubnets: any[]; privateSubnets: any[] },
      az: any,
      index: number
    ) => {
      const publicSubnet = new aws.ec2.Subnet(`publicSubnet${index}`, {
        vpcId: vpc.id,
        availabilityZone: az,
        cidrBlock: `${vpcCidrParts[0]}.${vpcCidrParts[1]}.${index}.${
          vpcCidrParts[3]
        }/${vpcMask + 8}`,
        mapPublicIpOnLaunch: true,
        tags: {
          Name: `${selectedProfile}-publicSubnet${index}`,
        },
      });
      const privateSubnet = new aws.ec2.Subnet(`privateSubnet${index}`, {
        vpcId: vpc.id,
        availabilityZone: az,
        cidrBlock: `${vpcCidrParts[0]}.${vpcCidrParts[1]}.${index + 3}.${
          vpcCidrParts[3]
        }/${vpcMask + 8}`,
        tags: {
          Name: `${selectedProfile}-privateSubnet${index + 3}`,
        },
      });

      result.publicSubnets.push(publicSubnet);
      result.privateSubnets.push(privateSubnet);

      return result;
    },
    { publicSubnets: [], privateSubnets: [] }
  );

  const internetGateway = new aws.ec2.InternetGateway("myInternetGateway", {
    vpcId: vpc.id,
    tags: {
      Name: `${selectedProfile}-internetGateway`,
    },
  });

  const [publicRouteTable, privateRouteTable] = ["public", "private"].map(
    (tableType) => {
      return new aws.ec2.RouteTable(`${tableType}RouteTable`, {
        vpcId: vpc.id,
      });
    }
  );

  const createRoute = (
    routeTableName: string,
    destinationCidrBlock: string,
    gatewayId: any
  ) => {
    return new aws.ec2.Route(`${routeTableName}Route`, {
      routeTableId:
        routeTableName === "public"
          ? publicRouteTable.id
          : privateRouteTable.id,
      destinationCidrBlock,
      gatewayId,
    });
  };

  const createRouteTableAssociation = (
    subnet: { id: any },
    routeTableName: string,
    index: any
  ) => {
    return new aws.ec2.RouteTableAssociation(
      `${routeTableName}RTAssociation${index}`,
      {
        subnetId: subnet.id,
        routeTableId:
          routeTableName === "public"
            ? publicRouteTable.id
            : privateRouteTable.id,
      }
    );
  };

  availabilityZones.forEach((az: any, index: string | number) => {
    createRouteTableAssociation(publicSubnets[index], "public", index);
    createRouteTableAssociation(privateSubnets[index], "private", index);
  });

  createRoute("public", "0.0.0.0/0", internetGateway.id);

  //Creating CloudWatch Agent Role
  const ec2Role = new aws.iam.Role("ec2Role", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "ec2.amazonaws.com",
          },
        },
      ],
    }),
  });

  new aws.iam.RolePolicyAttachment("rolePolicyAttachment", {
    role: ec2Role.name,
    policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
  });

  const instanceProfile = new aws.iam.InstanceProfile("instanceProfile", {
    role: ec2Role.name,
  });

  // Creating Load Balancer Security Group
  const loadBalancerSecurityGroup = new aws.ec2.SecurityGroup(
    "loadBalancerSecurityGroup",
    {
      description: "Security group for the load balancer",
      vpcId: vpc.id,
      ingress: [
        {
          protocol: "tcp",
          fromPort: 80,
          toPort: 80,
          cidrBlocks: ["0.0.0.0/0"],
        },
        {
          protocol: "tcp",
          fromPort: 443,
          toPort: 443,
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
      egress: [
        {
          protocol: "-1", // All
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
    }
  );

  // Creating EC2 Security Group
  const EC2SecurityGroup = new aws.ec2.SecurityGroup(
    "application-security-group",
    {
      vpcId: vpc.id,
      ingress: [
        {
          // securityGroups: [loadBalancerSecurityGroup.id],
          cidrBlocks: ["0.0.0.0/0"],
          protocol: "tcp",
          fromPort: 22,
          toPort: 22,
        },
        {
          protocol: "tcp",
          fromPort: 3000,
          toPort: 3000,
          securityGroups: [loadBalancerSecurityGroup.id],
        },
      ],
      egress: [
        {
          protocol: "-1", // All
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
    }
  );

  // Creating RDS Security Group
  const rdsSecurityGroup = new aws.ec2.SecurityGroup("sgRDS", {
    description: "csye 6225RDS security group",
    vpcId: vpc.id,
    ingress: [
      {
        protocol: "tcp",
        fromPort: 5432,
        toPort: 5432,
        securityGroups: [EC2SecurityGroup.id],
      },
    ],
    egress: [
      {
        protocol: "-1", // All
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
  });
  const dbParameterGroup = new aws.rds.ParameterGroup("db-p-group", {
    family: "postgres15",
    description: "Custom parameter group for csye6225",
  });
  const dbSubnetGroup = new aws.rds.SubnetGroup("dbsubnetG", {
    subnetIds: privateSubnets.map((subnet: { id: any }) => subnet.id),
    name: "csye6225",
    tags: {
      Name: "csye6225",
    },
  });

  // Creating RDS Instance
  const rdsInstance = new aws.rds.Instance("csye6225db-instance", {
    engine: rds.require("engine"),
    instanceClass: rds.require("instanceClass"),
    engineVersion: rds.require("engineVersion"),
    allocatedStorage: rds.require("allocatedStorage"),
    parameterGroupName: dbParameterGroup.name,
    storageType: rds.require("storageType"),
    dbName: rds.require("dbName"),
    username: rds.require("username"),
    password: rds.require("password"),
    skipFinalSnapshot: true,
    vpcSecurityGroupIds: [rdsSecurityGroup.id],
    dbSubnetGroupName: dbSubnetGroup.name,
    publiclyAccessible: false,
  });

  const ami = pulumi.output(
    aws.ec2.getAmi({
      owners: owners,
      mostRecent: true,
    })
  );

  // Create an SNS topic
  const snsTopic = new aws.sns.Topic("snsTopicAmi", {});

  const userData = pulumi.interpolate`#!/bin/bash
  sudo rm /opt/csye6225/web-app/.env
  sudo touch /opt/csye6225/web-app/.env
  sudo echo ENVIRONMENT=${config.require(
    "profile"
  )} >> /opt/csye6225/web-app/.env
  sudo echo PGPORT=${rds.require("port")} >> /opt/csye6225/web-app/.env
  sudo echo PGUSER=${rds.require("username")} >> /opt/csye6225/web-app/.env
  sudo echo PGPASSWORD=${rds.require("password")} >> /opt/csye6225/web-app/.env
  sudo echo PGDATABASE=${rds.require("dbName")} >> /opt/csye6225/web-app/.env
  sudo echo PGHOST=${rdsInstance.address} >> /opt/csye6225/web-app/.env
  sudo echo SNSTopicARN=${topic.arn} >> /opt/csye6225/web-app/.env
  sudo echo AWS_REGION=${selectedRegion} >> /opt/csye6225/web-app/.env
  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
      -a fetch-config \
      -m ec2 \
      -c file:/home/cloudwatch-agent-config.json \
      -s
  sudo systemctl enable amazon-cloudwatch-agent
  sudo systemctl start amazon-cloudwatch-agent
  `;

  const snsPublishPolicy = new aws.iam.Policy("SNSPublishPolicy", {
    policy: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sns:Publish",
          Resource: topic.arn,
        },
      ],
    },
    roles: [ec2Role.name],
  });
  const snsPublishPolicyAttachment = new aws.iam.RolePolicyAttachment(
    "SNSPublishPolicyAttachment",
    {
      role: ec2Role.name,
      policyArn: snsPublishPolicy.arn,
    }
  );

  // Creating Launch Template
  const launchtemplate = new aws.ec2.LaunchTemplate("launchtemplate", {
    name: "asg_launch_config",
    imageId: ami.id,
    instanceType: "t2.micro",
    keyName: keyName,
    disableApiTermination: false,
    dependsOn: [rdsInstance],

    iamInstanceProfile: {
      name: instanceProfile.name,
    },

    blockDeviceMappings: [
      {
        deviceName: "/dev/xvda",
        ebs: {
          deleteOnTermination: true,
          volumeSize: 25,
          volumeType: "gp2",
        },
      },
    ],

    networkInterfaces: [
      {
        associatePublicIpAddress: true,
        deleteOnTermination: true,
        securityGroups: [EC2SecurityGroup.id],
      },
    ],

    tagSpecifications: [
      {
        resourceType: "instance",
        tags: {
          Name: "asg_launch_config",
        },
      },
    ],

    userData: userData.apply(
      (data: WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>) =>
        Buffer.from(data).toString("base64")
    ),
  });

  // Creating Load Balancer
  const loadbalancer = new aws.lb.LoadBalancer("webAppLB", {
    name: "csye6225-lb",
    internal: false,
    loadBalancerType: "application",
    securityGroups: [loadBalancerSecurityGroup.id],
    subnets: publicSubnets,
    enableDeletionProtection: false,
    tags: {
      Application: "WebApp",
    },
  });

  // Creating Target Group
  const targetGroup = new aws.lb.TargetGroup("webAppTargetGroup", {
    name: "csye6225-lb-tg",
    port: 3000,
    protocol: "HTTP",
    vpcId: vpc.id,
    targetType: "instance",
    healthCheck: {
      enabled: true,
      path: "/healthz",
      port: "traffic-port",
      protocol: "HTTP",
      healthyThreshold: 2,
      unhealthyThreshold: 2,
      timeout: 6,
      interval: 30,
    },
  });

  const listener = new aws.lb.Listener("webAppListener", {
    loadBalancerArn: loadbalancer.arn,
    port: "80",
    protocol: "HTTP",
    defaultActions: [
      {
        type: "forward",
        targetGroupArn: targetGroup.arn,
      },
    ],
  });

  // Creating Auto Scaling Group
  const autoScalingGroup = new aws.autoscaling.Group("autoScalingGroup", {
    name: "asg_launch_config",
    maxSize: 3,
    minSize: 1,
    desiredCapacity: 1,
    forceDelete: true,
    defaultCooldown: 60,
    vpcZoneIdentifiers: publicSubnets,
    instanceProfile: instanceProfile.name,

    tags: [
      {
        key: "Name",
        value: "asg_launch_config",
        propagateAtLaunch: true,
      },
    ],

    launchTemplate: {
      id: launchtemplate.id,
      version: "$Latest",
    },
    dependsOn: [targetGroup],
    targetGroupArns: [targetGroup.arn],
  });

  const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
    autoscalingGroupName: autoScalingGroup.name,
    scalingAdjustment: 1,
    cooldown: 60,
    adjustmentType: "ChangeInCapacity",
    //estimatedInstanceWarmup: 60,
    autocreationCooldown: 60,
    cooldownDescription: "Scale up policy when average CPU usage is above 5%",
    policyType: "SimpleScaling",
    scalingTargetId: autoScalingGroup.id,
  });

  const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
    autoscalingGroupName: autoScalingGroup.name,
    scalingAdjustment: -1,
    cooldown: 60,
    adjustmentType: "ChangeInCapacity",
    //estimatedInstanceWarmup: 60,
    autocreationCooldown: 60,
    cooldownDescription: "Scale down policy when average CPU usage is below 3%",
    policyType: "SimpleScaling",
    scalingTargetId: autoScalingGroup.id,
  });

  const cpuUtilizationAlarmHigh = new aws.cloudwatch.MetricAlarm(
    "cpuUtilizationAlarmHigh",
    {
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 1,
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      period: 60,
      threshold: 5,
      statistic: "Average",
      alarmActions: [scaleUpPolicy.arn],
      dimensions: { AutoScalingGroupName: autoScalingGroup.name },
    }
  );

  const cpuUtilizationAlarmLow = new aws.cloudwatch.MetricAlarm(
    "cpuUtilizationAlarmLow",
    {
      comparisonOperator: "LessThanThreshold",
      evaluationPeriods: 1,
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      period: 60,
      statistic: "Average",
      threshold: 3,
      alarmActions: [scaleDownPolicy.arn],
      dimensions: { AutoScalingGroupName: autoScalingGroup.name },
    }
  );

  // Creating an A record in route53
  const hostedZone = aws.route53.getZone({
    name: route53Config.require("domainName"),
  });

  new aws.route53.Record(`aRecord`, {
    name: route53Config.require("domainName"),
    type: "A",
    zoneId: hostedZone.then((zone: { zoneId: any }) => zone.zoneId),
    aliases: [
      {
        name: loadbalancer.dnsName,
        zoneId: loadbalancer.zoneId,
        evaluateTargetHealth: true,
      },
    ],
  });

  
};

createVpcAndSubnets();

exports.vpcId = vpc.id;
