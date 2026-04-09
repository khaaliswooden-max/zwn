'use client';

import IngestForm from '@/components/IngestForm';

export default function IngestPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <div className="space-y-1">
        <div className="text-[9px] text-zwn-muted tracking-widest">DATA INGEST</div>
        <div className="text-[11px] text-zwn-border">
          submit raw events to platform /zwm/ingest endpoints
        </div>
      </div>

      <div className="border-t border-zwn-border pt-6">
        <IngestForm />
      </div>
    </div>
  );
}
