import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";


interface SpokeVpcArgs {
    vpcCidrBlock: string;
    tgwId: pulumi.Input<string>;
    tgwRouteTableId: pulumi.Input<string>;
}

export class SpokeVpc extends pulumi.ComponentResource {
    public name: string;
    public args: SpokeVpcArgs;
    public vpc: awsx.ec2.Vpc;
    public tgwAttachment: aws.ec2transitgateway.VpcAttachment;
    public workloadSubnetIds: pulumi.Output<string[]>;

    constructor(name: string, args: SpokeVpcArgs, opts?: pulumi.ResourceOptions) {
        super("awsAdvancedNetworkingWorkshop:index:SpokeVpc", name, {}, opts);

        this.name = name;
        this.args = args;

        // Define the VPC with isolated subnets since there's no NAT Gateway required.
        this.vpc = new awsx.ec2.Vpc(`${name}-vpc`, {
            cidrBlock: args.vpcCidrBlock,
            subnetStrategy: awsx.ec2.SubnetAllocationStrategy.Auto,
            subnetSpecs: [
                { name: "public", cidrMask: 24, type: awsx.ec2.SubnetType.Public },
                { name: "private", cidrMask: 24, type: awsx.ec2.SubnetType.Private },
                { name: "tgw", cidrMask: 28, type: awsx.ec2.SubnetType.Isolated }
            ],
            natGateways: { strategy: "Single" },
            enableDnsHostnames: true,
            enableDnsSupport: true
        });

        // Define the TGW attachment
        const tgwSubnets = pulumi.output(aws.ec2.getSubnetsOutput({
            filters: [
                { name: "tag:Name", values: [`${name}-vpc-tgw-*`] },
                { name: "vpc-id", values: [this.vpc.vpcId] }
            ]
        }));

        this.tgwAttachment = new aws.ec2transitgateway.VpcAttachment(`${name}-tgw-vpc-attachment`, {
            transitGatewayId: args.tgwId,
            subnetIds: tgwSubnets.apply(subnets => subnets.ids),
            vpcId: this.vpc.vpcId,
            transitGatewayDefaultRouteTableAssociation: false,
            transitGatewayDefaultRouteTablePropagation: false,
            tags: { "Name": name }
        }, { parent: this, deleteBeforeReplace: true });

        new aws.ec2transitgateway.RouteTableAssociation(`${name}-tgw-route-table-assoc`, {
            transitGatewayAttachmentId: this.tgwAttachment.id,
            transitGatewayRouteTableId: args.tgwRouteTableId
        }, { parent: this });

        new aws.ec2transitgateway.RouteTablePropagation(`${name}-tgw-route-table-propagation`, {
            transitGatewayAttachmentId: this.tgwAttachment.id,
            transitGatewayRouteTableId: args.tgwRouteTableId
        }, { parent: this });

        // Define workload subnet IDs using isolated subnet IDs from the VPC
        const privateSubnets = pulumi.output(aws.ec2.getSubnetsOutput({
            filters: [
                { name: "tag:Name", values: [`${name}-vpc-private-*`] },
                { name: "vpc-id", values: [this.vpc.vpcId] }
            ]
        }));

        this.workloadSubnetIds = privateSubnets.apply(subnets => subnets.ids);

        privateSubnets.apply(subnets => this.createVpcEndpoints(subnets.ids));
        privateSubnets.apply(subnets => this.createRouteTablesAndRoutes(subnets.ids));

        this.registerOutputs({
            vpc: this.vpc,
            workloadSubnetIds: this.workloadSubnetIds
        });
    }

    private createVpcEndpoints(subnetIds: string[]) {
        const vpcEndpointSg = new aws.ec2.SecurityGroup(`${this.name}-vpc-endpoint-sg`, {
            vpcId: this.vpc.vpcId,
            ingress: [{
                cidrBlocks: ["0.0.0.0/0"],
                description: "Allow everything",
                protocol: "-1",
                fromPort: 0,
                toPort: 0
            }],
            egress: [{
                cidrBlocks: ["0.0.0.0/0"],
                description: "Allow everything",
                protocol: "-1",
                fromPort: 0,
                toPort: 0
            }]
        });

        ["ec2messages", "ssmmessages", "ssm"].forEach(service => {
            new aws.ec2.VpcEndpoint(`${this.name}-endpoint-${service}`, {
                vpcId: this.vpc.vpcId,
                serviceName: pulumi.interpolate`com.amazonaws.${aws.config.region}.${service}`,
                privateDnsEnabled: true,
                securityGroupIds: [vpcEndpointSg.id],
                vpcEndpointType: "Interface",
                tags: { "Name": `${this.name}-${service}` },
                subnetIds: subnetIds
            });
        });
    }

    private createRouteTablesAndRoutes(subnetIds: string[]) {
        subnetIds.forEach((subnetId, index) => {
            const newRouteTable = new aws.ec2.RouteTable(`${this.name}-rt-${index}`, {
                vpcId: this.vpc.vpcId
            }, { parent: this });

            new aws.ec2.Route(`${this.name}-rt-route-${index}`, {
                routeTableId: newRouteTable.id,
                destinationCidrBlock: "0.0.0.0/0",
                transitGatewayId: this.args.tgwId
            }, {
                parent: newRouteTable,
                ignoreChanges: ["destinationCidrBlock"]
            });

            new aws.ec2.RouteTableAssociation(`${this.name}-rta-${index}`, {
                routeTableId: newRouteTable.id,
                subnetId: subnetId
            }, {
                parent: newRouteTable,
                deleteBeforeReplace: true
            });
        });
    }
}
