import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export function createFirewallPolicy(supernetCidr: string): pulumi.Output<string> {
    const dropRemote = new aws.networkfirewall.RuleGroup("drop-remote", {
        capacity: 2,
        type: "STATELESS",
        ruleGroup: {
            rulesSource: {
                statelessRulesAndCustomActions: {
                    statelessRules: [{
                        priority: 1,
                        ruleDefinition: {
                            actions: ["aws:drop"],
                            matchAttributes: {
                                protocols: [6],
                                sources: [{
                                    addressDefinition: "0.0.0.0/0"
                                }],
                                sourcePorts: [{
                                    fromPort: 22,
                                    toPort: 22,
                                }],
                                destinations: [{
                                    addressDefinition: "0.0.0.0/0"
                                }],
                                destinationPorts: [{
                                    fromPort: 22,
                                    toPort: 22,
                                }]
                            }
                        }
                    }]
                }
            }
        }
    });

    const allowIcmp = new aws.networkfirewall.RuleGroup("allow-icmp", {
        capacity: 100,
        type: "STATEFUL",
        ruleGroup: {
            ruleVariables: {
                ipSets: [{
                    key: "SUPERNET",
                    ipSet: {
                        definitions: [supernetCidr]
                    }
                }]
            },
            rulesSource: {
                rulesString: 'pass icmp $SUPERNET any -> $SUPERNET any (msg: "Allowing ICMP packets"; sid:2; rev:1;)'
            },
            statefulRuleOptions: {
                ruleOrder: "STRICT_ORDER"
            },
        }
    });

    const allowAmazon = new aws.networkfirewall.RuleGroup("allow-amazon", {
        capacity: 100,
        type: "STATEFUL",
        ruleGroup: {
            rulesSource: {
                rulesString: 'pass tcp any any <> $EXTERNAL_NET 443 (msg:"Allowing TCP in port 443"; flow:not_established; sid:892123; rev:1;)\n' +
                    'pass tls any any -> $EXTERNAL_NET 443 (tls.sni; dotprefix; content:".amazon.com"; endswith; msg:"Allowing .amazon.com HTTPS requests"; sid:892125; rev:1;)'
            },
            statefulRuleOptions: {
                ruleOrder: "STRICT_ORDER",
            },
        }
    });

    const policy = new aws.networkfirewall.FirewallPolicy("firewall-policy", {
        firewallPolicy: {
            statelessDefaultActions: ["aws:forward_to_sfe"],
            statelessFragmentDefaultActions: ["aws:forward_to_sfe"],
            statefulDefaultActions: ["aws:drop_strict", "aws:alert_strict"],
            statefulEngineOptions: {
                ruleOrder: "STRICT_ORDER"
            },
            statelessRuleGroupReferences: [{
                priority: 10,
                resourceArn: dropRemote.arn
            }],
            statefulRuleGroupReferences: [
                {
                    priority: 10,
                    resourceArn: allowIcmp.arn,
                },
                {
                    priority: 20,
                    resourceArn: allowAmazon.arn,
                },
            ]
        }
    });

    return policy.arn;
}
