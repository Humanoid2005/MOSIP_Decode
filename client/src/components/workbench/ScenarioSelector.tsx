import {
  scenarios,
  scenarioDefinition,
  scenarioUnavailable,
} from "../../../../server/models/scenarios";
import type { ScenarioId } from "../../../../server/models/scenarios";
import type { Wallet } from "../../models/playground";

// Test scenario picker used by the flow form and the rerun panel. Scenarios
// that cannot run with this wallet and format are disabled, and the reasons
// are listed under Scenario availability. fixtureAvailable and
// didFixtureAvailable say whether the issuer advertises the expired and
// unsupported-DID fixture configurations those scenarios need.
export function ScenarioSelector({
  value,
  onChange,
  wallet,
  format,
  fixtureAvailable = true,
  didFixtureAvailable = false,
}: {
  value: ScenarioId;
  onChange: (value: ScenarioId) => void;
  wallet: Wallet;
  format: string;
  fixtureAvailable?: boolean;
  didFixtureAvailable?: boolean;
}) {
  const selected = scenarioDefinition(value);
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        Test scenario
        <select
          className="field"
          value={value}
          onChange={(event) => onChange(event.target.value as ScenarioId)}
        >
          {scenarios.map((item) => {
            const reason = scenarioUnavailable(
              item.id,
              wallet,
              format,
              fixtureAvailable,
              didFixtureAvailable,
            );
            return (
              <option key={item.id} value={item.id} disabled={Boolean(reason)}>
                {item.name}
                {reason ? " · unavailable" : ""}
              </option>
            );
          })}
        </select>
      </label>
      <p className="text-xs leading-5 text-slate-500">{selected.description}</p>
      <p className="text-xs leading-5 text-slate-500">
        Expected: {selected.expected}
      </p>
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">Scenario availability</summary>
        <ul className="mt-2 space-y-2">
          {scenarios
            .filter((item) =>
              scenarioUnavailable(
                item.id,
                wallet,
                format,
                fixtureAvailable,
                didFixtureAvailable,
              ),
            )
            .map((item) => (
              <li key={item.id}>
                <strong>{item.name}:</strong>{" "}
                {scenarioUnavailable(
                  item.id,
                  wallet,
                  format,
                  fixtureAvailable,
                  didFixtureAvailable,
                )}
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}
