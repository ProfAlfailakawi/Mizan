import { Permission, Role } from '../types';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ['platform.manage','organization.manage','competition.create','competition.configure','participant.read','audit.read','identity.invite','identity.approve','identity.suspend','identity.audit'],
  org_admin: ['organization.manage','competition.create','competition.configure','competition.publish','participant.read','participant.edit','committee.manage','judge.manage','result.seal','result.publish','certificate.issue','audit.read','operations.manage','identity.invite','identity.approve','identity.suspend','identity.audit','participant.pass.reissue','session.recover','continuity.override'],
  comp_admin: ['competition.configure','competition.publish','participant.read','participant.edit','participant.checkin','committee.manage','judge.manage','result.calculate','result.seal','result.publish','certificate.issue','audit.read','operations.manage','identity.invite','identity.approve','identity.suspend','identity.audit','participant.pass.reissue','session.recover','continuity.override'],
  scientific_admin: ['competition.configure','judge.manage','judging.review','result.calculate','appeal.review','audit.read','quran.manage'],
  head_judge: ['participant.read','judging.review','result.calculate','appeal.review','audit.read','session.recover','continuity.override'],
  judge: ['participant.read','judging.submit'],
  ops_manager: ['participant.read','participant.checkin','committee.manage','operations.manage','participant.pass.reissue','session.recover'],
  exception_host: ['participant.read','participant.checkin','participant.edit','participant.pass.reissue'],
  delegation_manager: ['participant.read','participant.edit'],
  participant: [],
  broadcast_operator: ['broadcast.manage'],
  auditor: ['participant.read','audit.read','identity.audit'],
  guardian: ['participant.read'],
  support_agent: ['audit.read']
};

export function can(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role) {
  return ROLE_PERMISSIONS[role] ?? [];
}
