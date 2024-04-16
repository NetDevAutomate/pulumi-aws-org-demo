import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import {
  OrganizationsClient,
  ListAccountsCommand,
  InviteAccountToOrganizationCommand,
  ListHandshakesForAccountCommand,
  HandshakePartyType,
} from '@aws-sdk/client-organizations';

import * as fs from 'fs';

const region = 'eu-west-1';
const organizationsClient = new OrganizationsClient({ region: region });

async function checkPendingInvitations(accountId: string): Promise<boolean> {
  const command = new ListHandshakesForAccountCommand({
    Filter: {
      ActionType: 'INVITE',
    },
  });
  try {
    const response = await organizationsClient.send(command);
    // Filtering client-side due to SDK limitations
    return (
      response.Handshakes?.some(
        (handshake) =>
          handshake.State === 'OPEN' &&
          handshake.Parties?.some(
            (party) => party.Id === accountId && party.Type === 'ACCOUNT'
          )
      ) || false
    );
  } catch (error) {
    console.error(
      `Failed to check pending invitations for account ${accountId}:`,
      error
    );
    return false;
  }
}

async function main() {
  try {
    const organization = await aws.organizations.getOrganization({});
    console.log('Organization ID: ', organization.roots[0].id);

    const listAccountsCommand = new ListAccountsCommand({});
    const accountsResponse = await organizationsClient.send(
      listAccountsCommand
    );
    const existingAccounts =
      accountsResponse.Accounts?.map((acc) => acc.Id) || [];

    const configPath = '../accounts.json';
    const accountData = fs.readFileSync(configPath, 'utf8');
    const targetAccounts = JSON.parse(accountData);

    for (const account of targetAccounts) {
      if (existingAccounts.includes(account.accountId)) {
        console.log(
          `No action required: Account ${account.accountId} is already in the organization.`
        );
        continue;
      }

      const hasPendingInvitation = await checkPendingInvitations(
        account.accountId
      );
      if (hasPendingInvitation) {
        console.log(
          `Pending invitation already exists for account ${account.accountId}. No action required.`
        );
        continue;
      }

      const params = {
        Target: {
          Id: account.accountId,
          Type: 'ACCOUNT' as HandshakePartyType,
          Email: account.accountEmail,
        },
        Notes: 'Invitation to join organization',
      };

      try {
        const command = new InviteAccountToOrganizationCommand(params);
        const data = await organizationsClient.send(command);
        console.log(
          `Invitation sent to ${account.accountId}. Details:\nHandshake ID: ${data.Handshake.Id}\nState: ${data.Handshake.State}`
        );
      } catch (err) {
        console.error(`Error inviting ${account.accountId}:`, err);
      }
    }
  } catch (error) {
    console.error('Failed to fetch organization:', error);
  }
}

main();
