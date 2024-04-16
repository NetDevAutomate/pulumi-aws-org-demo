import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const assumeRole = aws.iam.getPolicyDocument({
    statements: [{
        effect: "Allow",
        principals: [{
            type: "Service",
            identifiers: ["config.amazonaws.com"],
        }],
        actions: ["sts:AssumeRole"],
    }],
});
const configRole = new aws.iam.Role("awsConfigRole", {
    name: "awsConfigRole",
    assumeRolePolicy: assumeRole.then(assumeRole => assumeRole.json),
});
const configRecorder = new aws.cfg.Recorder("configRecorder", {
    name: "configRecorder",
    roleArn: configRole.arn,
});
const awsConfigS3Rule = new aws.cfg.Rule("awsConfigS3Rule", {
    name: "awsConfigS3Rule",
    source: {
        owner: "AWS",
        sourceIdentifier: "S3_BUCKET_VERSIONING_ENABLED",
    },
}, {
    dependsOn: [configRecorder],
});

const configPolicyDoc = aws.iam.getPolicyDocument({
    statements: [{
        effect: "Allow",
        actions: ["config:Put*"],
        resources: ["*"],
    }],
});
const rolePolicy = new aws.iam.RolePolicy("rolePolicy", {
    name: "awsConfigRolePolicy",
    role: configRole.id,
    policy: configPolicyDoc.then(p => p.json),
});

// Creating a Config rule for tagging compliance
const configTaggingRule = new aws.cfg.Rule("tag-compliance", {
    source: {
        owner: "AWS",
        sourceIdentifier: "REQUIRED_TAGS",
    },
    inputParameters: JSON.stringify({
        tag1Key: "Environment",
    }),
    scope: {
        complianceResourceTypes: ["AWS::EC2::Instance"], // Set the resource type as needed
    },
    // Optionally add a description and tags
});

// Export the names of the resources
export const configTaggingRuleName = configTaggingRule.name;