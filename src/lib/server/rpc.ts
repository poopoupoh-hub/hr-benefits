/**
 * รายการ service ที่หน้าจอเรียกได้ผ่าน POST /api/rpc
 * ผู้เรียก (actorId) มาจาก session cookie ฝั่งเซิร์ฟเวอร์เสมอ — หน้าจอส่งเองไม่ได้
 * แต่ละ service ตรวจสิทธิ์ (RBAC) ภายในตัวเองอีกชั้น
 */
import * as admin from "../services/admin";
import * as changes from "../services/changes";
import * as claims from "../services/claims";

export const RPC_METHODS = {
  // คำขอเบิก
  validateClaim: claims.validateClaimFor,
  submitClaim: claims.submitClaim,
  updateClaim: claims.updateClaim,
  approveClaim: claims.approveClaim,
  rejectClaim: claims.rejectClaim,
  returnClaim: claims.returnClaim,
  recordPayment: claims.recordPayment,
  // คำขอแก้ไข (Maker–Checker)
  requestClaimChange: changes.requestClaimChange,
  requestLimitChange: changes.requestLimitChange,
  reviewChange: changes.reviewChange,
  // ข้อมูลหลัก
  createEmployee: admin.createEmployee,
  updateEmployee: admin.updateEmployee,
  setEmployeeActive: admin.setEmployeeActive,
  saveDepartment: admin.saveDepartment,
  deleteDepartment: admin.deleteDepartment,
  savePosition: admin.savePosition,
  deletePosition: admin.deletePosition,
  saveBenefit: admin.saveBenefit,
  saveFundRound: admin.saveFundRound,
  updatePayrollSettings: admin.updatePayrollSettings,
  // ระบบ
  updateSystemSettings: admin.updateSystemSettings,
  setRolePermission: admin.setRolePermission,
  setUserRole: admin.setUserRole,
  resetPassword: admin.resetPassword,
  changeOwnPassword: admin.changeOwnPassword,
  exportBackup: admin.exportBackup,
  restoreBackup: admin.restoreBackup,
  resetDemo: admin.resetDemo,
} as const;

export type RpcMethods = typeof RPC_METHODS;
export type RpcName = keyof RpcMethods;

/** method ที่ไม่แก้ข้อมูล */
export const READ_ONLY: ReadonlySet<RpcName> = new Set<RpcName>(["validateClaim"]);
/** method ที่ต้องโหลด Audit Log/อีเมลด้วย */
export const NEEDS_LOGS: ReadonlySet<RpcName> = new Set<RpcName>(["exportBackup"]);
/** method ที่รับไฟล์แนบ (index ของ argument ที่เป็น input หลังตัด actorId) */
export const ATTACHMENT_ARG: Partial<Record<RpcName, number>> = { submitClaim: 0, updateClaim: 1, validateClaim: 0 };
