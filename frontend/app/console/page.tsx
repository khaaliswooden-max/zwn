'use client';

import ApiKeyPanel from '@/components/ApiKeyPanel';
import ApiConsole from '@/components/ApiConsole';

export default function ConsolePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="text-[9px] text-zwn-muted tracking-widest">API CONSOLE</div>

      <ApiKeyPanel />

      <div className="border-t border-zwn-border pt-6">
        <ApiConsole />
      </div>
    </div>
  );
}
