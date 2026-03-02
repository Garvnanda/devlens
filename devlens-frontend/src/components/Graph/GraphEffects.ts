import { MeshLambertMaterial } from 'three';

export const createNodeMaterial = (
    isHovered: boolean,
    isSelected: boolean,
    isDimmed: boolean
) => {
    const color = '#06B6D4';
    let emissiveIntensity = 0.6;
    let opacity = 0.9;
    let scale = 1;

    if (isSelected) {
        scale = 1.5;
        emissiveIntensity = 2.0;
    } else if (isHovered) {
        scale = 1.2;
        emissiveIntensity = 1.5;
    } else if (isDimmed) {
        opacity = 0.1;
        emissiveIntensity = 0.1;
    }

    const material = new MeshLambertMaterial({
        color,
        transparent: true,
        opacity,
    });

    // Custom properties to be used in rendering
    return { material, scale, emissiveIntensity };
};
