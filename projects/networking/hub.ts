import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

interface HubVpcArgs {
    supernetCidrBlock: string;
    vpcCidrBlock: string;
    tgwId: pulumi.Input<string>;
    spokeTgwRouteTableId: pulumi.Input<string>;
    hubTgwRouteTableId: pulumi.Input<string>;
    firewallPolicyArn: pulumi.Input<string>;
}

export class HubVpc extends pulumi.ComponentResource {
    name: string;
    args: HubVpcArgs;
    vpc: awsx.ec2.Vpc;
    eip: aws.ec2.Eip;
    natGateway: aws.ec2.NatGateway;
    tgwAttachment: aws.ec2transitgateway.VpcAttachment;

    constructor(name: string, args: HubVpcArgs, opts?: pulumi.ResourceOptions) {
        super("awsAdvancedNetworkingWorkshop:index:HubVpc", name, {}, opts);

        this.name = name;
        this.args = args;

        this.vpc = new awsx.ec2.Vpc(`${name}-vpc`, {
          cidrBlock: args.vpcCidrBlock,
          subnetStrategy: awsx.ec2.SubnetAllocationStrategy.Auto,
            subnetSpecs: [
                { type: awsx.ec2.SubnetType.Public, cidrMask: 24 },
                { type: awsx.ec2.SubnetType.Private, cidrMask: 24 },
                { type: awsx.ec2.SubnetType.Isolated, cidrMask: 24, name: "tgw" }
            ],
            natGateways: { strategy: awsx.ec2.NatGatewayStrategy.Single },
        }, { parent: this });

        this.eip = new aws.ec2.Eip(`${name}-eip`, {}, { parent: this });

        this.natGateway = new aws.ec2.NatGateway(`${name}-nat-gateway`, {
            subnetId: this.vpc.publicSubnetIds[0],
            allocationId: this.eip.allocationId,
            tags: { Name: `${name}-nat-gateway` }
        }, { parent: this });

        this.tgwAttachment = new aws.ec2transitgateway.VpcAttachment(`${name}-tgw-vpc-attachment`, {
            transitGatewayId: args.tgwId,
            subnetIds: this.vpc.isolatedSubnetIds,
            vpcId: this.vpc.vpcId,
            transitGatewayDefaultRouteTableAssociation: false,
            transitGatewayDefaultRouteTablePropagation: false,
            applianceModeSupport: "enable",
            tags: { Name: name },
        }, { deleteBeforeReplace: true, dependsOn: [this.vpc], parent: this });

        this.createFirewall();

        this.registerOutputs({
          publiSubnets: this.vpc.publicSubnetIds,
          isolateSubnets: this.vpc.isolatedSubnetIds,
          vpc: this.vpc,
          eip: this.eip,
          tgwAttachment: this.tgwAttachment
        });
    }

    private createDirectNatRoutes(publicSubnetIds: string[], isolatedSubnetIds: string[]) {
        // Add actual routing logic here
    }

    private createFirewall() {
        // Add firewall creation logic here
    }
}

// Usage example
const hubVpcArgs: HubVpcArgs = {
    supernetCidrBlock: "10.10.0.0/16",
    vpcCidrBlock: "10.20.0.0/16",
    tgwId: pulumi.output("tgw-123"),
    spokeTgwRouteTableId: pulumi.output("rtb-123"),
    hubTgwRouteTableId: pulumi.output("rtb-456"),
    firewallPolicyArn: pulumi.output("arn:aws:firewall-policy:123")
};

const hubVpc = new HubVpc("myHubVpc", hubVpcArgs);
