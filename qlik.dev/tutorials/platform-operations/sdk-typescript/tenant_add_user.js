import { getUsers, createUser } from '@qlik/api/users';
import { ROLE_TENANT_ADMIN } from './constants.js';

export async function runTenantAddUser(sourceHostConfig, targetHostConfig, email) {
  const { data: usersResp } = await getUsers({ filter: `email eq "${email}"` }, { hostConfig: sourceHostConfig });
  if (!usersResp.data || usersResp.data.length === 0) {
    throw new Error(`No user with email '${email}' found in '${sourceHostConfig.host}'.`);
  }
  const [sourceUser] = usersResp.data;
  console.info(`Retrieved user '${email}' from '${sourceHostConfig.host}'.`);

  const { data: user } = await createUser(
    {
      name: sourceUser.name,
      email: sourceUser.email,
      subject: sourceUser.subject,
      status: 'active',
      assignedRoles: [{ name: ROLE_TENANT_ADMIN }],
    },
    { hostConfig: targetHostConfig },
  );
  console.info(`Added user '${email}' as '${ROLE_TENANT_ADMIN}' with ID '${user.id}' in '${targetHostConfig.host}'.`);
  return user;
}
