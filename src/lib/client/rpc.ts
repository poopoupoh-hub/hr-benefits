/**
 * รายการ service ที่หน้าจอเรียกได้ผ่าน api.<ชื่อคำสั่ง>(...)
 * ผู้เรียก (actorId) มาจาก session เสมอ — หน้าจอส่งเองไม่ได้
 * แต่ละ service ตรวจสิทธิ์ (RBAC) ภายในตัวเองอีกชั้น
 */
import * as admin from "../services/admin";
import * as changes from "../services/changes";
import * as claims from "../services/claims";

export const RPC_METHODS = {
  // คำขอเบิก — พนักงาน
  validateClaim: claims.validateClaimFor,
  submitClaim: claims.submitClaim,
  updateClaim: claims.updateClaim,
  // ขั้นที่ 1: HR ตรวจเอกสาร
  verifyClaim: claims.verifyClaim,
  returnClaim: claims.returnClaim,
  // ขั้นที่ 2: หัวหน้างานอนุมัติ
  approveClaim: claims.approveClaim,
  setDelegation: claims.setDelegation,
  // ไม่อนุมัติ (ทั้งสองขั้น)
  rejectClaim: claims.rejectClaim,
  // บัญชี
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

/** method ที่ไม่แก้ข้อมูล (ไม่ต้องโหลดหน้าจอใหม่) */
export const READ_ONLY: ReadonlySet<RpcName> = new Set<RpcName>(["validateClaim"]);
/** method ที่รับไฟล์แนบ (index ของ argument ที่เป็น input หลังตัด actorId) */
export const ATTACHMENT_ARG: Partial<Record<RpcName, number>> = { submitClaim: 0, updateClaim: 1 };
