import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import {
  OrganizationsClient,
  EnableAWSServiceAccessCommand,
  RegisterDelegatedAdministratorCommand,
  ListDelegatedAdministratorsCommand,
  HandshakePartyType,
  ListAWSServiceAccessForOrganizationCommand,
} from '@aws-sdk/client-organizations';

import {
  FMSClient,
  GetAdminAccountCommand,
  AssociateAdminAccountCommand,
} from '@aws-sdk/client-fms';

import {
  SecurityHubClient,
  EnableSecurityHubCommand,
} from '@aws-sdk/client-securityhub';

import * as fs from 'fs';

const region = 'eu-west-1';
const organizationsClient = new OrganizationsClient({ region: region });
const awsProvider = new aws.Provider('awsProvider', { region: region });

async function enableServiceAccess(servicePrincipal: string): Promise<boolean> {
  const command = new EnableAWSServiceAccessCommand({
    ServicePrincipal: servicePrincipal,
  });
  try {
    const response = await organizationsClient.send(command);
    console.log(`Service access enabled for ${servicePrincipal}`, response);
    return true;
  } catch (error) {
    console.error(
      `Failed to enable service access for ${servicePrincipal}:`,
      error
    );
    return false;
  }
}

async function isAlreadyDelegated(
  accountId: string,
  servicePrincipal: string
): Promise<boolean> {
  const command = new ListDelegatedAdministratorsCommand({
    ServicePrincipal: servicePrincipal,
  });
  try {
    const response = await organizationsClient.send(command);
    return (
      response.DelegatedAdministrators?.some(
        (admin) => admin.Id === accountId
      ) || false
    );
  } catch (error) {
    console.error(
      `Failed to check delegated administrators for ${servicePrincipal}:`,
      error
    );
    return false;
  }
}

async function delegateAdministrator(
  accountId: string,
  servicePrincipal: string
) {
  const command = new RegisterDelegatedAdministratorCommand({
    AccountId: accountId,
    ServicePrincipal: servicePrincipal,
  });
  try {
    const response = await organizationsClient.send(command);
    console.log(`Delegated administrator set for ${accountId}:`, response);
  } catch (error) {
    console.error(
      `Error setting delegated administrator for ${accountId}:`,
      error
    );
  }
}

async function enableSecurityHub(accountId: string) {
  const securityHubClient = new SecurityHubClient({ region: region });

  try {
    const securityHubAccount = new aws.securityhub.Account(
      'mySecurityHubAccount',
      {
        autoEnableControls: true, // Automatically enable security controls
        enableDefaultStandards: true, // Enable default security standards
      }
    );
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      // Subscribe the account to Security Hub
      const enableSecurityHubCmd = new EnableSecurityHubCommand({});
      await securityHubClient.send(enableSecurityHubCmd);
      console.log(`Account ${accountId} subscribed to Security Hub.`);
    } else {
      throw error;
    }
  }

  const account = new aws.securityhub.Account(
    'securityHubAccount',
    {},
    { provider: awsProvider }
  );
  const subscription = new aws.securityhub.StandardsSubscription(
    'foundationalSecurityPractices',
    {
      standardsArn: `arn:aws:securityhub:${region}:${accountId}:standards/aws-foundational-security-best-practices/v/1.0.0`,
    },
    { provider: awsProvider }
  );

  return {
    securityHubAccountId: account.id,
    subscriptionArn: subscription.standardsArn,
  };
}

async function main() {
  const configServicePrincipal = 'config.amazonaws.com';
  const enabledConfigService = await enableServiceAccess(
    configServicePrincipal
  );
  if (!enabledConfigService) return;

  const configPath = '../accounts.json';
  const accountData = fs.readFileSync(configPath, 'utf8');
  const targetAccounts = JSON.parse(accountData);

  for (const account of targetAccounts) {
    if (account.delegatedAdminAccount) {
      const alreadyDelegated = await isAlreadyDelegated(
        account.accountId,
        configServicePrincipal
      );
      if (!alreadyDelegated) {
        await delegateAdministrator(account.accountId, configServicePrincipal);
      } else {
        console.log(
          `Account ${account.accountId} is already a delegated administrator for ${configServicePrincipal}.`
        );
      }
    }
    if (account.securityHubAccount) {
      const results = await enableSecurityHub(account.accountId);
      const securityHubAccountId = results.securityHubAccountId;
      const subscriptionArn = results.subscriptionArn;
      pulumi.all([securityHubAccountId, subscriptionArn]).apply(([id, arn]) => {
        console.log(
          `Security Hub setup completed with ID: ${id} and Subscription ARN: ${arn}`
        );
      });
    }
  }
}

main();
