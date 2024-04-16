import * as aws from '@pulumi/aws';
import {
  OrganizationsClient,
  EnableAWSServiceAccessCommand,
  ListAWSServiceAccessForOrganizationCommand,
  EnabledServicePrincipal,
} from '@aws-sdk/client-organizations';
import {
  FMSClient,
  GetAdminAccountCommand,
  AssociateAdminAccountCommand,
} from '@aws-sdk/client-fms';
import * as fs from 'fs';

const region = 'eu-west-1';
const organizationsClient = new OrganizationsClient({ region: region });
const fmsClient = new FMSClient({ region: region });

const MAX_RETRIES = 5; // Maximum number of retries
const RETRY_DELAY_MS = 10000; // Delay between retries in milliseconds

async function enableFMSServiceAccess(): Promise<boolean> {
  const servicePrincipal = 'fms.amazonaws.com';

  // Check if FMS is already enabled
  const listCommand = new ListAWSServiceAccessForOrganizationCommand({});
  const listResponse = await organizationsClient.send(listCommand);
  const fmsEnabled = listResponse.EnabledServicePrincipals?.some(
    (principal: EnabledServicePrincipal) =>
      principal.ServicePrincipal === servicePrincipal
  );

  if (fmsEnabled) {
    console.log('AWS Firewall Manager is already enabled.');
    return true;
  }

  // Enable FMS service access
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

async function ensureFMSAdmin(
  accountId: string,
  retryCount = 0
): Promise<void> {
  try {
    const adminAccount = new aws.fms.AdminAccount(
      `fmsAdminAccount-${accountId}-${Date.now()}`,
      {
        accountId: accountId,
      }
    );

    const adminAccountId = adminAccount.accountId;
    const getAdminCmd = new GetAdminAccountCommand({});
    const response = await fmsClient.send(getAdminCmd);

    if (response.AdminAccount === accountId) {
      console.log(`Account ${accountId} is already the FMS admin.`);
    } else {
      const associateAdminCmd = new AssociateAdminAccountCommand({
        AdminAccount: accountId,
      });
      await fmsClient.send(associateAdminCmd);
      console.log(`Account ${accountId} set as the FMS admin.`);
    }
  } catch (error) {
    console.error(`Failed to set or check FMS admin for ${accountId}:`, error);
    if (error.name === 'ResourceNotFoundException') {
      if (retryCount < MAX_RETRIES) {
        console.error(
          `AWS Firewall Manager is not enabled for account ${accountId}. Enabling it now...`
        );
        const enabledFMSService = await enableFMSServiceAccess();
        if (!enabledFMSService) {
          console.error(
            'Failed to enable AWS Firewall Manager for account',
            accountId
          );
          return;
        }
        console.log(
          `Waiting ${RETRY_DELAY_MS / 1000} seconds before retrying...`
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        await ensureFMSAdmin(accountId, retryCount + 1); // Retry after enabling FMS and waiting
      } else {
        console.error(
          `Failed to set FMS admin for account ${accountId} after ${MAX_RETRIES} retries.`
        );
      }
    }
  }
}

async function main() {
  const configPath = '../accounts.json';
  const accountData = fs.readFileSync(configPath, 'utf8');
  const targetAccounts = JSON.parse(accountData);

  for (const account of targetAccounts) {
    if (account.fmsAdminAccount) {
      await ensureFMSAdmin(account.accountId);
    }
  }
}

main();
