// Croissance différée : chaque repas ajoute un segment au prochain déplacement.
export class SnakeGrowth {
    constructor() {
        this.pending = 0;
        this.eaten = 0;
    }

    feed(segments = 1) {
        this.pending += segments;
        this.eaten++;
    }

    // Appelé à chaque déplacement : true si la queue doit rester en place.
    consume() {
        if (this.pending <= 0) return false;
        this.pending--;
        return true;
    }
}
