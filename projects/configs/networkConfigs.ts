import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

export interface ClientConfig {
  customerGatewayAsn: pulumi.Input<string>;
  customerGatewayIp: string;
  customerGatewayDescription: string;
  orgSummary: string;
  allowedIps: string[];
}

export const clientConfig: ClientConfig = {
  customerGatewayAsn: '64511',
  customerGatewayIp: '81.143.49.129',
  customerGatewayDescription: 'Home Office VPN',
  orgSummary: '10.0.0.0/8',
  allowedIps: ['81.143.49.128/28'],
};

export interface WorkloadSecurityGroup {
  name: string;
  description: string;
  ingress: aws.types.input.ec2.SecurityGroupIngress[];
  egress: aws.types.input.ec2.SecurityGroupEgress[];
  vpcId?: string;
}

export const workloadSecurityGroups: WorkloadSecurityGroup[] = [
  {
    name: 'workload-default-sg',
    description: 'Workload Default Security Group',
    ingress: [
      {
        protocol: 'tcp',
        fromPort: 22,
        toPort: 22,
        cidrBlocks: ['0.0.0.0/0'],
      },
      {
        protocol: 'tcp',
        fromPort: 443,
        toPort: 443,
        cidrBlocks: clientConfig.allowedIps,
      },
    ],
    egress: [
      {
        protocol: '-1',
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ['0.0.0.0/0'],
      },
    ],
  },
];

interface NetworkConfiguration {
  cidrBlock: string;
  amazonSideAsn: number;
  transitGatewayCidrBlock: string;
}

export interface RegionConfig {
  standard: NetworkConfiguration;
  accelerated: NetworkConfiguration;
}

export interface TransiGatewayArgs {
  region: string;
  amazonSideAsn: number;
  regionalCidrBlock: string;
  transitGatewayCidrBlock: string;
  routeTables: string[];
}

// Here, we declare NetworkConfigs as an array of NetworkParam
export const transiGatewayArgs: TransiGatewayArgs[] = [
  {
    region: 'eu-west-1',
    amazonSideAsn: 64521,
    regionalCidrBlock: '10.100.0.0/16',
    transitGatewayCidrBlock: '10.200.0.0/24',
    routeTables: ['default', 'accelerated', 'standard'],
  },
  // {
  //   region: 'eu-west-2',
  //   amazonSideAsn: 64522,
  //   regionalCidrBlock: '10.101.0.0/16',
  //   transitGatewayCidrBlock: '10.201.0.0/24',
  //   routeTables: ['default', 'accelerated', 'standard'],
  // },
];
