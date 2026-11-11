import {BufferAttribute, BufferGeometry} from "three";

export interface ObjMesh {
    geometry: BufferGeometry;
    restPositions: Float32Array;
    restNormals: Float32Array;
    vatU: Float32Array;
    materials: (string | null)[];
}

export function parseObj(text: string): ObjMesh {
    const v: number[] = [];
    const vt: number[] = [];
    const vn: number[] = [];
    const vt2: number[] = [];

    const positions: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const vatU: number[] = [];
    let hasNormals = true;

    const materials: (string | null)[] = [];
    const groups: { start: number; material: string | null }[] = [];
    const startGroup = (name: string | null) => {
        const last = groups[groups.length - 1];
        if (last && last.material === name) return;
        if (last && last.start === positions.length / 3) groups.pop();
        groups.push({start: positions.length / 3, material: name});
    };
    startGroup(null);

    const index = (raw: string | undefined, count: number) => {
        if (!raw) return -1;
        const i = parseInt(raw, 10);
        return i < 0 ? count + i : i - 1;
    };

    const pushCorner = (corner: string) => {
        const [pi, ti, ni] = corner.split("/");
        const p = index(pi, v.length / 3);
        const t = index(ti, vt.length / 2);
        const n = index(ni, vn.length / 3);
        positions.push(v[p * 3], v[p * 3 + 1], v[p * 3 + 2]);
        uvs.push(t >= 0 ? vt[t * 2] : 0, t >= 0 ? vt[t * 2 + 1] : 0);
        if (n >= 0) normals.push(vn[n * 3], vn[n * 3 + 1], vn[n * 3 + 2]);
        else hasNormals = false;
        vatU.push(vt2[p] ?? 0);
    };

    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (line === "" || line.startsWith("#")) continue;
        const parts = line.split(/\s+/);
        switch (parts[0]) {
            case "v":
                v.push(+parts[1], +parts[2], +parts[3]);
                break;
            case "vt":
                vt.push(+parts[1], +parts[2]);
                break;
            case "vn":
                vn.push(+parts[1], +parts[2], +parts[3]);
                break;
            case "vt2":
                vt2.push(+parts[1]);
                break;
            case "usemtl":
                startGroup(parts.slice(1).join(" "));
                break;
            case "f":
                for (let i = 2; i < parts.length - 1; i++) {
                    pushCorner(parts[1]);
                    pushCorner(parts[i]);
                    pushCorner(parts[i + 1]);
                }
                break;
        }
    }

    const geometry = new BufferGeometry();
    const vertexCount = positions.length / 3;
    groups.forEach((group, i) => {
        const end = i + 1 < groups.length ? groups[i + 1].start : vertexCount;
        if (end <= group.start) return;
        let index = materials.indexOf(group.material);
        if (index < 0) index = materials.push(group.material) - 1;
        geometry.addGroup(group.start, end - group.start, index);
    });
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
    if (hasNormals) geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
    else geometry.computeVertexNormals();

    return {
        geometry,
        restPositions: (geometry.getAttribute("position").array as Float32Array).slice(),
        restNormals: (geometry.getAttribute("normal").array as Float32Array).slice(),
        vatU: new Float32Array(vatU),
        materials,
    };
}
