const canvas = document.getElementById("particleCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    if (window.innerWidth < 768) {
        canvas.width = window.innerWidth; // Mobilde tam ekran
    } else {
        canvas.width = window.innerWidth * 0.3; // Masaüstünde sağ %30
    }
    canvas.height = window.innerHeight;
}
resizeCanvas();

let particlesArray = [];

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5; // Noktaları biraz daha küçülttüm
        this.speedY = Math.random() * 0.5 + 0.2; // ÇOK YAVAŞ aşağı akış hızı
    }
    
    update() {
        this.y += this.speedY;

        if (this.y > canvas.height) {
            this.y = 0 - this.size;
            this.x = Math.random() * canvas.width;
        }
    }
    
    draw() {
        // Göz yormaması için saydam (opacity: 0.4) turuncu renk
        ctx.fillStyle = "rgba(255, 152, 0, 0.4)";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function init() {
    particlesArray = [];
    for (let i = 0; i < 60; i++) { // Nokta sayısını da biraz azalttık
        particlesArray.push(new Particle());
    }
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
        particlesArray[i].draw();
    }
    requestAnimationFrame(animate);
}

init();
animate();

window.addEventListener("resize", () => {
    resizeCanvas();
    init();
});