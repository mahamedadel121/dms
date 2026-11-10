import { Suspense } from 'react';
import { RequestSubmitPage } from '@/features/request-submit/RequestSubmitPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RequestSubmitPage />
    </Suspense>
  );
}
