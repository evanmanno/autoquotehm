// Team roles. Owner created the company; Manager can approve quotes and send
// them without approval; Estimator sends quotes for approval.
export const ROLES = ['owner', 'manager', 'estimator']
export const INVITE_ROLES = ['estimator', 'manager']

export const canApprove = (role) => role === 'owner' || role === 'manager'
export const roleLabelKey = (role) =>
  role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'Estimator'
