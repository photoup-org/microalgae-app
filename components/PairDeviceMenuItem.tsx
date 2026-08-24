"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Unlink } from "lucide-react";
import { pairThisDeviceAction, unpairThisDeviceAction } from "@/actions/pairing";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * Pairs this browser with the local instance so it survives an internet outage.
 *
 * Rendered only where pairing is actually available, which is the instance running
 * on the Pi. On the cloud instance the prop is null and nothing appears - a
 * pairing cookie issued there would be for the wrong origin and would never be
 * sent to the Pi.
 */
export function PairDeviceMenuItem({ paired }: { paired: boolean }) {
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function pair() {
        startTransition(async () => {
            const result = await pairThisDeviceAction();
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success(`Dispositivo emparelhado por ${result.data} dias. Funciona sem internet.`);
            router.refresh();
        });
    }

    function unpair() {
        startTransition(async () => {
            await unpairThisDeviceAction();
            toast.success("Emparelhamento removido deste dispositivo.");
            router.refresh();
        });
    }

    return (
        <DropdownMenuItem
            disabled={pending}
            onSelect={(e) => {
                e.preventDefault();
                if (paired) unpair();
                else pair();
            }}
        >
            {paired ? <Unlink className="size-4" /> : <Link2 className="size-4" />}
            {paired ? "Remover emparelhamento" : "Emparelhar este dispositivo"}
        </DropdownMenuItem>
    );
}
