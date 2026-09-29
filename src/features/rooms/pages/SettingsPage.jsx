import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">
          Settings
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Property and application settings.
        </p>
      </div>

      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">
          Property profile
        </h2>

        <div className="mt-5 space-y-4">
          <Input
            label="Property name"
            defaultValue="Stayman Demo Property"
          />

          <Input
            label="Phone"
            defaultValue="+91 98765 43210"
          />

          <Input
            label="Email"
            defaultValue="manager@example.com"
          />

          <Input
            label="Address"
            defaultValue="Bengaluru, Karnataka"
          />

          <Button>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}