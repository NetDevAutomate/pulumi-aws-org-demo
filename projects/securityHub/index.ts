import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export const awsSecutityHub = new aws.securityhub.Account("orgSecurityAccount", {
    autoEnableControls: true,
    controlFindingGenerator: "STANDARD_CONTROL",
    enableDefaultStandards: true,
});
