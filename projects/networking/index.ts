import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { HubVpc } from "./hub";
import { SpokeVpc } from "./spoke";
import { SpokeWorkload } from "./spokeWorkloads";
import { createFirewallPolicy } from "./firewallRules";

const project = pulumi.getProject();

const config = new pulumi.Config();
const region = config. require("region");
const hubAndSpokeSupernet = config.require("hub-and-spoke-supernet");

export const tgw = new aws.ec2transitgateway.TransitGateway("tgw", {
    description: `Transit Gateway - ${project}`,
    defaultRouteTableAssociation: "disable",
    defaultRouteTablePropagation: "disable",
    tags: {
        Name: "Pulumi"
    }
});

const inspectionTgwRouteTable = new aws.ec2transitgateway.RouteTable("post-inspection-tgw-route-table", {
    transitGatewayId: tgw.id,
    tags: {
        Name: "post-inspection",
    }
}, {
    parent: tgw,
});

export const spokeTgwRouteTable = new aws.ec2transitgateway.RouteTable("spoke-tgw-route-table", {
    transitGatewayId: tgw.id,
    tags: {
        Name: "spoke-tgw",
    }
}, {
    parent: tgw,
});

export const hubTgwRouteTable = new aws.ec2transitgateway.RouteTable("hub-tgw-route-table", {
    transitGatewayId: tgw.id,
    tags: {
        Name: "hub-tgw-route-table",
    }
}, {
    parent: tgw,
});

export const firewallPolicyArn = createFirewallPolicy(hubAndSpokeSupernet);

const hubVpc = new HubVpc("hub", {
    supernetCidrBlock: hubAndSpokeSupernet,
    vpcCidrBlock: "10.254.0.0/16",
    tgwId: tgw.id,
    hubTgwRouteTableId: hubTgwRouteTable.id,
    spokeTgwRouteTableId: spokeTgwRouteTable.id,
    firewallPolicyArn: firewallPolicyArn,
});

export const natGatewayEip = hubVpc.eip.publicIp;

export const spoke1Vpc = new SpokeVpc("spoke1", {
    vpcCidrBlock: "10.101.0.0/16",
    tgwId: tgw.id,
    tgwRouteTableId: spokeTgwRouteTable.id,
});

export const hubToSpoke1 = new aws.ec2transitgateway.RouteTablePropagation("hub-to-spoke1", {
    transitGatewayAttachmentId: spoke1Vpc.tgwAttachment.id,
    transitGatewayRouteTableId: hubTgwRouteTable.id,
});

export const spoke1Workload = new SpokeWorkload("spoke1", {
    spokeInstanceSubnetId: spoke1Vpc.vpc.publicSubnetIds[0],
    spokeVpcId: spoke1Vpc.vpc.vpcId
});

// The commented code for spoke2 can be uncommented and used similarly
// if needed in future expansion of the network setup.
