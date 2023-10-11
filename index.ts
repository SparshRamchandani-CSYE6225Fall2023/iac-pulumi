const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const config = new pulumi.Config("aws");
const configure = new pulumi.Config("assignment-4");

const selectedRegion = config.require("region");
const vpcCidrBlock = configure.require("vpcCidrBlock");
const vpc = new aws.ec2.Vpc("myVpc", {
    cidrBlock: vpcCidrBlock,
});

const createVpcAndSubnets = async () => {

    const azs = await aws.getAvailabilityZones({ state: 'available', region: selectedRegion });
    const availabilityZones = azs.names.slice(0, 3);

    const { publicSubnets, privateSubnets } = availabilityZones.reduce((result: { publicSubnets: any[]; privateSubnets: any[]; }, az: any, index: number) => {
        const publicSubnet = new aws.ec2.Subnet(`publicSubnet${index}`, {
            vpcId: vpc.id,
            availabilityZone: az,
            cidrBlock: `10.0.${index}.0/24`,
            mapPublicIpOnLaunch: true,
        });
        const privateSubnet = new aws.ec2.Subnet(`privateSubnet${index}`, {
            vpcId: vpc.id,
            availabilityZone: az,
            cidrBlock: `10.0.${index + 3}.0/24`,
        });

        result.publicSubnets.push(publicSubnet);
        result.privateSubnets.push(privateSubnet);

        return result;
    }, { publicSubnets: [], privateSubnets: [] });

    const internetGateway = new aws.ec2.InternetGateway("myInternetGateway", {
        vpcId: vpc.id,
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
};

createVpcAndSubnets();

exports.vpcId = vpc.id;