export interface MtlMaterial {
    color: [number, number, number];
    emissive: [number, number, number] | null;
    dissolve: number;
}

export function parseMtl(text: string): Map<string, MtlMaterial> {
    const materials = new Map<string, MtlMaterial>();
    let current: MtlMaterial | null = null;
    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (line === "" || line.startsWith("#")) continue;
        const [key, ...values] = line.split(/\s+/);
        if (key === "newmtl") {
            current = {color: [1, 1, 1], emissive: null, dissolve: 1};
            materials.set(values.join(" "), current);
            continue;
        }
        if (!current) continue;
        const rgb = () => [+values[0], +values[1], +values[2]] as [number, number, number];
        switch (key) {
            case "Kd":
                current.color = rgb();
                break;
            case "Ke":
                current.emissive = rgb();
                break;
            case "d":
                current.dissolve = +values[0];
                break;
            case "Tr":
                current.dissolve = 1 - +values[0];
                break;
        }
    }
    return materials;
}

export function isEmissive(material: MtlMaterial | undefined): boolean {
    return !!material?.emissive && material.emissive.some(c => c > 0);
}
