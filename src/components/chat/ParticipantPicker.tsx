import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AiParticipantDTO } from "@/types";

const MIN_PARTICIPANTS = 2;
const TOO_FEW_MESSAGE = "Add at least 2 AI participants in Settings";

interface ParticipantPickerProps {
  participants: AiParticipantDTO[];
  value: string | null;
  onChange: (participantId: string) => void;
  disabled?: boolean;
}

// Required for every message and never pre-selected (US-026). Participants arrive sorted by alias from the API.
// Below two participants the picker is disabled with the PRD tooltip (US-012).
export function ParticipantPicker({ participants, value, onChange, disabled = false }: ParticipantPickerProps) {
  const tooFew = participants.length < MIN_PARTICIPANTS;

  const select = (
    <Select value={value ?? ""} onValueChange={onChange} disabled={disabled || tooFew}>
      <SelectTrigger className="w-full sm:w-60" aria-label="AI participant" data-testid="participant-select">
        <SelectValue placeholder="Choose a participant" />
      </SelectTrigger>
      <SelectContent>
        {participants.map((participant) => (
          <SelectItem key={participant.id} value={participant.id} data-testid="participant-option">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: participant.color }}
              aria-hidden="true"
            />
            {participant.alias}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!tooFew) {
    return select;
  }

  // A disabled trigger emits no pointer events, so the tooltip hangs on a wrapper; the same text is also
  // available to assistive technology as a note, since a disabled control cannot be focused.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex w-full sm:w-auto">{select}</span>
      </TooltipTrigger>
      <TooltipContent>{TOO_FEW_MESSAGE}</TooltipContent>
      <span role="note" className="sr-only">
        {TOO_FEW_MESSAGE}
      </span>
    </Tooltip>
  );
}

export default ParticipantPicker;
