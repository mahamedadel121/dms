// All user-facing text of the bot (Egyptian Arabic).
import type { BotDraft } from './types';

export const BTN = {
  newRequest: 'طلب جديد',
  myRequests: 'طلباتي',
  menu: 'القائمة',
  corrections: 'تصحيح مطلوب',
  shareContact: '📱 شارك رقم تليفوني',
  yes: 'أيوه',
  no: 'لأ',
  vcr: 'طلب تغيير عربية',
  back: 'رجوع',
  odoOk: 'الرقم صح',
  odoRedo: 'هكتب تاني',
  photosDone: 'خلصت صور',
  lineCancel: 'إلغاء المصروف ده',
  addAnother: 'إضافة مصروف تاني',
  finished: 'كده خلصت',
  confirm: 'تأكيد وإرسال',
  edit: 'تعديل',
  cancel: 'إلغاء',
  cancelYes: 'أيوه، إلغاء الطلب',
  cancelNo: 'لأ، كمّل',
  resume: 'أكمل الطلب',
  discard: 'امسح وابدأ من جديد',
  delLine: 'مسح المصروف',
  changeAmount: 'تغيير المبلغ',
  skip: 'تخطي',
  toSummary: 'رجوع للملخص',
  corrDone: 'خلصت وابعت',
} as const;

export const M = {
  welcome: 'أهلاً بيك في نظام مصاريف السواقين 👋\nعشان نتعرف عليك، دوس على الزرار اللي تحت وشارك رقم تليفونك.',
  useButton: 'من فضلك استخدم زرار "شارك رقم تليفوني" اللي تحت. مش بقبل الرقم مكتوب.',
  foreignContact: 'الرقم ده مش رقم حسابك على تليجرام. شارك رقمك إنت من الزرار.',
  unknownPhone: 'مش لاقي الرقم ده عندنا. كلم المشرف بتاعك عشان يضيفك على النظام.',
  alreadyLinked: 'الرقم ده مربوط بحساب تليجرام تاني. كلم المشرف عشان يفك الربط.',
  linked: (name: string) => `أهلاً يا ${name} ✅\nتم ربط حسابك. تقدر تبدأ طلب جديد من القايمة.`,
  menu: 'اختار من القايمة 👇',
  noAssignment: 'مفيش عربية مربوطة بيك حالياً. تقدر تبعت طلب تغيير عربية.',
  vehicleStopped: (n: string) => `عربية رقم ${n} موقوفة حالياً، فمش هينفع تبعت مصاريف عليها. كلم المشرف.`,
  vcrPending: 'طلب تغيير العربية بتاعك لسه عند مسؤول الشحن. هنبلغك أول ما يتقرر وتقدر تكمل.',
  confirmVehicle: (n: string, cc: string) => `عربيتك رقم ${n} (${cc})؟`,
  askVcr: 'اكتب رقم العربية الجديدة (أرقام بس).',
  vcrSame: 'ده نفس رقم عربيتك الحالية.',
  vcrCreated: (n: string) => `تمام، بعتنا طلب تغيير العربية لرقم ${n} لمسؤول الشحن. هنبلغك لما يتقرر.`,
  vcrCreatedUnknown: (t: string) =>
    `مش لاقي عربية برقم ${t} عندنا، بس بعتنا الطلب لمسؤول الشحن يراجعه. هنبلغك لما يتقرر.`,
  vcrDecided: (ok: boolean) =>
    ok ? 'اتوافق على تغيير العربية ✅ تقدر تبدأ طلب جديد.' : 'طلب تغيير العربية اترفض. كلم المشرف لو محتاج.',
  askOdometer: 'اكتب قراية العداد الحالية (أرقام بس).',
  badOdometer: 'القراية لازم تكون رقم صحيح من غير حروف. اكتبها تاني.',
  odoLower: (last: number, n: number) => `⚠️ القراية ${n} أقل من آخر قراية متسجلة للعربية (${last}). متأكد؟`,
  odoJump: (last: number | null, n: number) =>
    `⚠️ القراية ${n} فرقها كبير عن آخر قراية (${last ?? '-'}). متأكد؟`,
  chooseType: 'اختار نوع المصروف 👇',
  askAmount: (cat: string) => `${cat}\nاكتب المبلغ (بالجنيه).`,
  badAmount: 'المبلغ لازم يكون رقم أكبر من صفر. اكتبه تاني (مثلاً 150 أو 75.5).',
  askPhotos: (min: number) =>
    `ابعت صور الإيصال للمصروف ده (صورة أو أكتر، أو ملف PDF).${min > 0 ? ` لازم على الأقل ${min}.` : ''}\nولما تخلص دوس "خلصت صور".`,
  photoGot: (n: number) => `استلمت ✅ (عدد الملفات: ${n}). ابعت كمان أو دوس "خلصت صور".`,
  photoBad: 'الملف ده مش مقبول. ابعت صورة أو PDF بس.',
  photoTooMany: (max: number) => `وصلت للحد الأقصى (${max} ملفات). دوس "خلصت صور".`,
  needPhotos: (min: number) => `لازم تبعت ${min} صورة على الأقل قبل ما تكمل.`,
  photoNotNow: 'مش محتاج صور دلوقتي.',
  textInsteadOfPhoto: 'محتاج صورة الإيصال دلوقتي 📷 ابعتها كصورة أو PDF، أو دوس "خلصت صور" لو خلصت.',
  lineAdded: 'تمام، المصروف اتسجل ✅ تحب تضيف مصروف تاني؟',
  badField: (label: string) => `القيمة دي مش مظبوطة لـ "${label}". اكتبها تاني.`,
  askField: (label: string) => `اكتب ${label}.`,
  cancelAsk: 'متأكد إنك عايز تلغي الطلب وتمسح كل اللي اتسجل؟',
  cancelled: 'اتلغى الطلب ✅',
  editPick: 'اختار المصروف اللي عايز تعدله 👇',
  editLine: (i: number, name: string, amount: string) => `مصروف ${i + 1}: ${name} — ${amount} ج`,
  askNewAmount: 'اكتب المبلغ الجديد.',
  lineDeleted: 'اتمسح المصروف ✅',
  amountChanged: 'اتغير المبلغ ✅',
  submitted: (num: string) =>
    `✅ الطلب اتبعت بنجاح!\n\nرقم الطلب:\n<b><code>${num}</code></b>\n\nاكتب الرقم ده على الإيصالات المدبسة وسلمها لمسؤول الحملة.`,
  submitFailed: 'حصلت مشكلة وإحنا بنبعت الطلب. متقلقش، الطلب لسه محفوظ عندك. جرب تاني كمان شوية.',
  noRequests: 'لسه معندكش طلبات.',
  myRequestsHeader: 'آخر طلباتك:',
  noCorrections: 'مفيش تصحيحات مطلوبة منك دلوقتي 👍',
  corrPick: 'اختار الطلب اللي محتاج تصحيح 👇',
  corrIntro: (num: string, line: string | null, reason: string, comment: string) =>
    `طلب رقم ${num} محتاج تصحيح.\n${line ? `المصروف: ${line}\n` : ''}السبب: ${reason}\nملاحظة المراجع: ${comment}`,
  corrAskAmount: 'اكتب المبلغ الصحيح.',
  corrAskPhotos: 'ابعت الصورة (أو الصور) الصحيحة، ولما تخلص دوس "خلصت وابعت". الصور القديمة بتتحفظ في السجل.',
  corrNeedPhotos: 'ابعت صورة واحدة على الأقل الأول.',
  corrSent: 'اتبعت التصحيح للمراجع ✅',
  corrGone: 'التصحيح ده اتقفل أو مش متاح.',
  draftExpired: 'الطلب القديم انتهت مدته واتمسح. هنبدأ طلب جديد.',
  resumeOrDiscard: 'عندك طلب لسه مخلصش. تكمله ولا تمسحه؟',
  stale: 'الزرار ده قديم. ده اللي المفروض تعمله دلوقتي 👇',
  unexpected: 'مش فاهم القصد 🤔 استخدم الأزرار أو القايمة.',
  error: 'حصلت مشكلة عندنا، آسفين 🙏 جرب تاني كمان شوية. اللي كنت فيه محفوظ.',
  rateLimited: 'براحة شوية 🙂 استنى لحظات وكمل.',
  unlinkedNow: 'حسابك اتفك عن النظام. ابعت /start عشان تربطه تاني.',
} as const;

export const STATUS_AR: Record<string, string> = {
  IN_REVIEW: 'تحت المراجعة',
  CORRECTION_REQUESTED: 'مطلوب تصحيح',
  APPROVED: 'اتوافق عليه',
  PAID: 'اتصرف',
  REJECTED: 'مرفوض',
  CANCELLED: 'ملغي',
};

export const REASON_AR: Record<string, string> = {
  IMAGE_UNCLEAR: 'الصورة مش واضحة',
  WRONG_AMOUNT: 'المبلغ غلط',
  MISSING_IMAGE: 'صورة ناقصة',
  OTHER: 'سبب تاني',
};

export function summaryText(d: BotDraft, total: string): string {
  const lines = d.lines.map((l, i) => `${i + 1}) ${l.categoryName} — ${l.amount} ج — ${l.attachmentIds.length} ملف`);
  return [
    '📋 ملخص الطلب',
    `عربية: ${d.vehicleNumber} (${d.costCenterCode})`,
    `العداد: ${d.odometer ?? '-'}${d.odometerWarning ? ' ⚠️' : ''}`,
    '',
    ...lines,
    '',
    `الإجمالي: ${total} ج`,
  ].join('\n');
}
