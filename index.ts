const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const config = new pulumi.Config("aws");
const configure = new pulumi.Config("assignment-4");

const selectedRegion = config.require("region");
const vpcCidrBlock = configure.require("vpcCidrBlock");
const selectedProfile = config.require("profile");

const keyName = new pulumi.Config("keyName").require("key");

var splittedCidrBlock = vpcCidrBlock.split('/');
var vpcMask = parseInt(splittedCidrBlock[1]);
const vpcCidrParts = splittedCidrBlock[0].split('.');
// console.log(selectedProfile);

const vpc = new aws.ec2.Vpc("myVpc", {
    cidrBlock: vpcCidrBlock,
    tags:{
        Name: `${selectedProfile}-vpc`
    }
});

const createVpcAndSubnets = async () => {
    const azs = await aws.getAvailabilityZones({ state: 'available', region: selectedRegion });
    const availabilityZones = azs.names.slice(0, azs.names.length < 3 ? azs.names.length : 3);

    const { publicSubnets, privateSubnets } = availabilityZones.reduce((result: { publicSubnets: any[]; privateSubnets: any[]; }, az: any, index: number) => {
        const publicSubnet = new aws.ec2.Subnet(`publicSubnet${index}`, {
            vpcId: vpc.id,
            availabilityZone: az,
            cidrBlock: `${vpcCidrParts[0]}.${vpcCidrParts[1]}.${index}.${vpcCidrParts[3]}/${vpcMask+8}`,
            mapPublicIpOnLaunch: true,
            tags:
            {
                Name: `${selectedProfile}-publicSubnet${index}`
            }
        });
        const privateSubnet = new aws.ec2.Subnet(`privateSubnet${index}`, {
            vpcId: vpc.id,
            availabilityZone: az,
            cidrBlock: `${vpcCidrParts[0]}.${vpcCidrParts[1]}.${index + 3}.${vpcCidrParts[3]}/${vpcMask+8}`,
            tags:
            {
                Name: `${selectedProfile}-privateSubnet${index+3}`
            }
        });

        result.publicSubnets.push(publicSubnet);
        result.privateSubnets.push(privateSubnet);

        return result;
    }, { publicSubnets: [], privateSubnets: [] });

    const internetGateway = new aws.ec2.InternetGateway("myInternetGateway", {
        vpcId: vpc.id,
        tags:
        {
            Name: `${selectedProfile}-internetGateway`
        }
    });

    const [publicRouteTable, privateRouteTable] = ['public', 'private'].map(tableType => {
        return new aws.ec2.RouteTable(`${tableType}RouteTable`, {
            vpcId: vpc.id,
        });
    });

    const createRoute = (routeTableName: string, destinationCidrBlock: string, gatewayId: any) => {
        return new aws.ec2.Route(`${routeTableName}Route`, {
            routeTableId: routeTableName === 'public' ? publicRouteTable.id : privateRouteTable.id,
            destinationCidrBlock,
            gatewayId,
        });
    };

    const createRouteTableAssociation = (subnet: { id: any; }, routeTableName: string, index: any) => {
        return new aws.ec2.RouteTableAssociation(`${routeTableName}RTAssociation${index}`, {
            subnetId: subnet.id,
            routeTableId: routeTableName === 'public' ? publicRouteTable.id : privateRouteTable.id,
        });
    };

    availabilityZones.forEach((az: any, index: string | number) => {
        createRouteTableAssociation(publicSubnets[index], 'public', index);
        createRouteTableAssociation(privateSubnets[index], 'private', index);
    });

    createRoute('public', '0.0.0.0/0', internetGateway.id);

    const securityGroup = new aws.ec2.SecurityGroup("application-security-group", {
        vpcId: vpc.id,
        ingress: [
            {
                cidrBlocks: ["0.0.0.0/0"],
                protocol: "tcp",
                fromPort: 22,
                toPort: 22,
            },
            {
                cidrBlocks: ["0.0.0.0/0"],
                protocol: "tcp",
                fromPort: 80,
                toPort: 80,
            },
            {
                cidrBlocks: ["0.0.0.0/0"],
                protocol: "tcp",
                fromPort: 443,
                toPort: 443,
            },
            {
                cidrBlocks: ["0.0.0.0/0"],
                protocol: "tcp",
                fromPort: 3000,
                toPort: 3000,
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
    
    

    const rdsSecurityGroup = new aws.ec2.SecurityGroup("sgRDS", {
        description: "csye 6225RDS security group",
        vpcId: vpc.id,
        ingress: [
          {
            protocol: "tcp",
            fromPort: 5432,
            toPort: 5432,
            securityGroups: [securityGroup.id],
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
      const dbParameterGroup = new aws.rds.ParameterGroup(
        "db-p-group",
        {
          family: "postgres15",
          description: "Custom parameter group for csye6225"
        }
      );
      const dbSubnetGroup = new aws.rds.SubnetGroup("dbsubnetG", {
        subnetIds: privateSubnets.map((subnet: { id: any; }) => subnet.id),
        name: "csye6225",
        tags: {
          Name: "csye6225",
        },
      });
      const rdsInstance = new aws.rds.Instance("csye6225db-instance", {
        engine: "postgres",
        instanceClass: "db.t3.micro",
        engineVersion: 15,
        allocatedStorage: 20,
        parameterGroupName: dbParameterGroup.name,
        storageType: "gp2",
        dbName: "csye6225",
        username: "csye6225",
        password: "postgres",
        skipFinalSnapshot: true,
        vpcSecurityGroupIds: [rdsSecurityGroup.id],
        dbSubnetGroupName: dbSubnetGroup.name,
        publiclyAccessible: false,
      });


      const ami = pulumi.output(aws.ec2.getAmi({
        owners: ["773453770225"],
        mostRecent: true,
    }));

    console.log(ami.id);
    
    const instance = new aws.ec2.Instance("web-app-server", {
        ami: ami.id,
        userData: pulumi.interpolate `#!/bin/bash
        sudo rm /home/admin/web-app/.env
        sudo touch /home/admin/web-app/.env
        sudo echo PGPORT=5432 >> /home/admin/web-app/.env
        sudo echo PGUSER="csye6225" >> /home/admin/web-app/.env
        sudo echo PGPASSWORD="postgres" >> /home/admin/web-app/.env
        sudo echo PGDATABASE="csye6225" >> /home/admin/web-app/.env
        sudo echo PGHOST=${rdsInstance.address} >> /home/admin/web-app/.env
        sudo mv /home/admin/web-app/systemd/webapp.service /lib/systemd/system/webapp.service
        sudo systemctl daemon-reload
        sudo systemctl enable webapp
        sudo systemctl start webapp
        `,
        instanceType: "t2.micro",
        subnetId: publicSubnets[0].id,
        keyName: keyName,
        vpcSecurityGroupIds: [
            securityGroup.id,
        ],
        rootBlockDevice: {
            volumeSize: 25,
            volumeType: "gp2",
        },
        disableApiTermination:false,
        userDataReplaceOnChange:true,
        dependsOn: [rdsInstance],
        tags: {
            Name: "web-app Pulumi",
        },
    });
};

createVpcAndSubnets();

exports.vpcId = vpc.id;