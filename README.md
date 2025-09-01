# 🕹️ The Arcade Room

A browser-based 3D arcade experience featuring multiple interactive games with realistic physics simulation. Built with Three.js and custom physics engine.

![Arcade Room](images/claw-machine.jpg)


## 🚀 Getting Started

### Prerequisites
- Modern web browser with WebGL support
- Local web server (recommended for development)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/arcade-room.git
   cd arcade-room
   ```

2. **Start a local web server**
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Node.js (if you have http-server installed)
   npx http-server
   
   # Using PHP
   php -S localhost:8000
   ```

3. **Open in browser**
   Navigate to `http://localhost:8000` in your web browser

## 🎯 Controls

### Main Game
- **H** - Toggle pause menu
- **Arrow Keys / WASD** - Move around
- **Mouse** - Look around
- **Escape** - Exit machine mode

### Claw Machine Mode
- **Arrow Keys / WASD** - Move claw horizontally
- **Down Arrow** - Start drop sequence
- **P** - Toggle camera mode
- **R** - Force reset claw state (debug)
- **Escape** - Exit claw machine

### Candy Machine Mode
- **C** - Insert coin
- **M** - Start candy dispensing
- **Escape** - Exit candy machine
## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Three.js** community for the excellent 3D library
- **GLB models** from various 3D artists
- **Physics simulation** inspiration from real arcade machines
- **Testing and feedback** from arcade enthusiasts

## 🎯 Future Features

- [ ] Multiplayer support
- [ ] High score system
- [ ] More arcade machines (pinball, air hockey)
- [ ] VR support
- [ ] Mobile controls
- [ ] Machine customization
- [ ] Achievement system



---

*Built with ❤️ and JavaScript*
