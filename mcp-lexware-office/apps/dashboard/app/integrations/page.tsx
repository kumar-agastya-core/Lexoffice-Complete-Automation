import IntegrationCard from '@/components/IntegrationCard';

export default function IntegrationsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Integrations</h1>
      <p className="mb-6 text-sm text-gray-500">
        Upload monthly reports from your payment providers. Documents are processed automatically
        and exceptions appear in the{' '}
        <a href="/exceptions" className="text-blue-600 hover:underline">Exception Tray</a>.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <IntegrationCard
          title="SumUp Monthly Report"
          description="Upload your monthly payment report PDF from SumUp. Revenue and processing fees are booked as separate vouchers."
          uploadUrl="/api/integrations/sumup/upload"
          accept=".pdf,application/pdf"
          integrationType="sumup"
        />

        <IntegrationCard
          title="Hello Cash Monthly Report"
          description="Upload your Umsatzübersicht PDF or CSV from Hello Cash. Card and cash revenue are booked separately."
          uploadUrl="/api/integrations/hellocash/upload"
          accept=".pdf,.csv,application/pdf,text/csv"
          integrationType="hellocash"
        />
      </div>
    </div>
  );
}
