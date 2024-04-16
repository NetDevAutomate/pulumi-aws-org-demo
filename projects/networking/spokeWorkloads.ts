import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

interface SpokeWorkloadArgs {
    spokeVpcId: pulumi.Input<string>;
    spokeInstanceSubnetId: pulumi.Input<string>;
}

export class SpokeWorkload extends pulumi.ComponentResource {
    constructor(name: string, args: SpokeWorkloadArgs, opts?: pulumi.ResourceOptions) {
        super("awsAdvancedNetworkingWorkshop:index:SpokeWorkload", name, {}, opts);

        const sg = new aws.ec2.SecurityGroup(`${name}-instance-sg`, {
            description: "Allow all outbound traffic",
            vpcId: args.spokeVpcId,
            egress: [{
                cidrBlocks: ["0.0.0.0/0"],
                description: "Allow everything",
                protocol: "-1",
                fromPort: 0,
                toPort: 0
            }]
        }, { parent: this });

        const ec2Role = new aws.iam.Role(`${name}-instance-role`, {
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: {
                    Effect: "Allow",
                    Principal: {
                        Service: "ec2.amazonaws.com",
                    },
                    Action: "sts:AssumeRole",
                },
            })
        });

        new aws.iam.RolePolicyAttachment(`${name}-role-policy-attachment`, {
            role: ec2Role.name,
            policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
        });

        const instanceProfile = new aws.iam.InstanceProfile(`${name}-instance-profile`, {
            role: ec2Role.name,
        });

        const amazonLinux2 = aws.ec2.getAmiOutput({
            mostRecent: true,
            owners: ["amazon"],
            filters: [
                { name: "name", values: ["amzn2-ami-hvm-*-x86_64-gp2"] },
                { name: "owner-alias", values: ["amazon"] }
            ],
        });

        amazonLinux2.apply(ami => {
            new aws.ec2.Instance(`${name}-instance`, {
                ami: ami.id,
                instanceType: "t3.micro",
                vpcSecurityGroupIds: [sg.id],
                subnetId: args.spokeInstanceSubnetId,
                tags: {
                    Name: `${name}-instance`,
                },
                iamInstanceProfile: instanceProfile.name,
            }, { parent: this });
        });
    }
}
