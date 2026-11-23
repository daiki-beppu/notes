import { mount } from "./app";
import "./style.css";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("#app がありません");
mount(root);
