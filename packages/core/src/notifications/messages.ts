// Egyptian-Arabic texts for submitter (Telegram) notifications (PLAN 5.9). English titles are for approvers' in-app rows.
export const submitterMessages = {
  REQ_SUBMITTED: (number: string) => `تم استلام طلبك رقم ${number} وهو دلوقتي قيد المراجعة.`,
  REQ_AT_STEP: (number: string, stepNameAr: string) => `طلبك رقم ${number} دلوقتي عند ${stepNameAr}.`,
  REQ_CORRECTION: (number: string, comments: string[]) =>
    `طلبك رقم ${number} محتاج تصحيح:\n${comments.map((c) => `- ${c}`).join('\n')}\nافتح "تصحيح مطلوب" من القائمة وصحّح.`,
  REQ_LINE_EDITED: (number: string, detail: string) => `تم تعديل بند في طلبك رقم ${number}: ${detail}`,
  REQ_REJECTED: (number: string, reason: string) => `للأسف تم رفض طلبك رقم ${number}.\nالسبب: ${reason}`,
  REQ_PAID: (number: string) => `تم صرف طلبك رقم ${number}. شكراً.`,
};

export const userMessages = {
  stepWaiting: (number: string, stepNameAr: string, stepNameEn: string) => ({
    titleAr: `طلب جديد في انتظارك: ${number}`,
    titleEn: `Request waiting for you: ${number}`,
    bodyAr: `الطلب ${number} في خطوة "${stepNameAr}" ومحتاج إجراء منك.`,
    bodyEn: `Request ${number} is at step "${stepNameEn}" and needs your action.`,
  }),
  correctionReturned: (number: string, stepNameAr: string, stepNameEn: string) => ({
    titleAr: `السائق رد على طلب التصحيح: ${number}`,
    titleEn: `Correction answered: ${number}`,
    bodyAr: `السائق صحّح الطلب ${number} وبقى جاهز للمراجعة في خطوة "${stepNameAr}".`,
    bodyEn: `The submitter answered the correction on ${number}; it is back at "${stepNameEn}".`,
  }),
};
